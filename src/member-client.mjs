import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { AccessError, requireText } from './protocol.mjs';

/** Per-client durable mapping; failure is fail-closed, never an optimization-only cache. */
export class MemberClient {
  constructor({ connect, databasePath, serviceId, account, onHistory }) {
    this.connect = connect; this.serviceId = requireText(serviceId, 'serviceId', 200); this.account = requireText(account, 'account', 200);
    this.onHistory = onHistory; this.peer = null; this.connecting = null; this.attached = new Set(); this.listeners = new Map(); this.busy = new Set(); this.opening = new Map();
    this.stopped = false; this.reconnectTimer = null; this.reconnectAttempt = 0; this.lastRecoveryError = null;
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS client_mapping(local_id TEXT PRIMARY KEY,service_id TEXT NOT NULL,account TEXT NOT NULL,remote_id TEXT NOT NULL,cursor INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS client_submissions(local_id TEXT NOT NULL,message_id TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(local_id,message_id));`);
    this.db.exec("UPDATE client_submissions SET state='unknown' WHERE state='running'");
  }
  async ensureConnected() {
    if (this.stopped) throw new AccessError(-32001, 'Member client is closed');
    if (this.peer && !this.peer.closed) return this.peer;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const peer = await this.connect();
      try {
        peer.on('message', m => {
          if (m.id !== undefined) { peer.error(m.id, new AccessError(-32601, 'Reverse client methods are unsupported')); return; }
          if (m.method === 'session/update') this.listeners.get(m.params?.sessionId)?.(m.params);
        });
        await peer.request('initialize', { protocolVersion: 1, clientCapabilities: {} });
        const identity = await peer.request('workbench/whoami', {});
        if (identity.account !== this.account || identity.serviceId !== this.serviceId) throw new AccessError(-32003, 'Connected identity/service differs from configured entry');
        if (this.stopped || peer.closed) throw new AccessError(-32001, 'Member client closed during connection');
        this.peer = peer; this.attached.clear(); this.reconnectAttempt = 0;
        peer.on('disconnected', () => { if (this.peer === peer) { this.peer = null; this.attached.clear(); this.scheduleRecovery(); } });
        return peer;
      } catch (error) { peer.close(); throw error; }
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  mapping(localId) {
    const row = this.db.prepare('SELECT * FROM client_mapping WHERE local_id=?').get(localId);
    if (row && (row.service_id !== this.serviceId || row.account !== this.account)) throw new AccessError(-32003, 'Saved conversation belongs to a different account/service');
    return row;
  }
  open(localId) {
    if (this.opening.has(localId)) return this.opening.get(localId);
    const operation = this.openUnshared(localId).finally(() => this.opening.delete(localId));
    this.opening.set(localId, operation); return operation;
  }
  async openUnshared(localId) {
    requireText(localId, 'local sessionId', 200);
    const peer = await this.ensureConnected(); let row = this.mapping(localId);
    if (!row) {
      const result = await peer.request('session/new', {});
      this.db.prepare('INSERT INTO client_mapping VALUES(?,?,?,?,0)').run(localId, this.serviceId, this.account, result.sessionId);
      row = this.mapping(localId); this.attached.add(row.remote_id);
    } else if (!this.attached.has(row.remote_id)) {
      // Explicit failure: never replace this mapping or replay conversation history.
      await peer.request('session/load', { sessionId: row.remote_id });
      this.attached.add(row.remote_id);
    }
    const history = await peer.request('workbench/history', { sessionId: row.remote_id, after: Number(row.cursor) });
    if (history.events.length) {
      await this.onHistory?.({ localId, sessionId: row.remote_id, ...history });
      this.advance(localId, history.events.at(-1).seq);
    }
    return { peer, row: this.mapping(localId), history };
  }
  advance(localId, seq) {
    if (this.stopped) return;
    if (Number.isSafeInteger(seq)) this.db.prepare('UPDATE client_mapping SET cursor=MAX(cursor,?) WHERE local_id=?').run(seq, localId);
  }
  /** All submissions have stable identity; a previously attempted message must never run twice. */
  async prompt(localId, { messageId, text, signal, onUpdate }) {
    requireText(messageId, 'messageId', 200); requireText(text, 'user text', 256 * 1024);
    if (this.busy.has(localId)) throw new AccessError(-32007, 'Local conversation already running');
    const previous = this.db.prepare('SELECT state FROM client_submissions WHERE local_id=? AND message_id=?').get(localId, messageId);
    if (previous) throw new AccessError(-32005, 'This message was already submitted. Restore history; do not automatically retry.', { state: previous.state });
    this.busy.add(localId);
    let row, peer, sent = false;
    try {
      ({ row, peer } = await this.open(localId));
      if (signal?.aborted) throw new AccessError(-32010, 'Cancelled before submission');
      this.db.prepare('INSERT INTO client_submissions VALUES(?,?,?)').run(localId, messageId, 'running');
      const requestId = createHash('sha256').update(`${this.serviceId}\0${this.account}\0${localId}\0${messageId}`).digest('hex');
      this.listeners.set(row.remote_id, notification => {
        onUpdate?.(notification.update); this.advance(localId, notification._meta?.sequence);
      });
      const abort = () => { if (!peer.closed) peer.notify('session/cancel', { sessionId: row.remote_id }); };
      signal?.addEventListener('abort', abort, { once: true });
      sent = true;
      try {
        const result = await peer.request('session/prompt', { sessionId: row.remote_id, prompt: [{ type: 'text', text }], _meta: { requestId } }, { timeoutMs: 0 });
        this.db.prepare('UPDATE client_submissions SET state=? WHERE local_id=? AND message_id=?').run(result.stopReason, localId, messageId);
        return result;
      } finally { signal?.removeEventListener('abort', abort); }
    } catch (error) {
      if (sent && !this.stopped) this.db.prepare("UPDATE client_submissions SET state='unknown' WHERE local_id=? AND message_id=?").run(localId, messageId);
      throw error;
    } finally { if (row) this.listeners.delete(row.remote_id); this.busy.delete(localId); }
  }
  async recoverAll() {
    await this.ensureConnected();
    const rows = this.db.prepare('SELECT local_id FROM client_mapping WHERE service_id=? AND account=?').all(this.serviceId, this.account);
    for (const row of rows) await this.open(row.local_id);
    this.lastRecoveryError = null;
  }
  scheduleRecovery() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(500 * 2 ** this.reconnectAttempt++, 5000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.recoverAll().catch(error => {
        this.lastRecoveryError = error;
        // Only transport/draining errors get another attach attempt; never call prompt here.
        if (!this.stopped && (!this.peer || [-32001, -32002, -32007].includes(error.code))) this.scheduleRecovery();
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }
  disconnect() { this.peer?.close(); }
  close() { this.stopped = true; clearTimeout(this.reconnectTimer); this.reconnectTimer = null; this.disconnect(); this.db.close(); }
}
