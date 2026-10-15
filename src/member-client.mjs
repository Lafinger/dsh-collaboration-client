import { DatabaseSync } from 'node:sqlite';
import { createHash,randomUUID,randomBytes } from 'node:crypto';
import { AccessError, requireText, initializeParams, requireInitializeResult } from './protocol.mjs';
import { attachmentCapability, requireAttachmentCapability } from './attachment-protocol.mjs';

/** Per-client durable mapping; failure is fail-closed, never an optimization-only cache. */
export class MemberClient {
  constructor({ connect, databasePath, serviceId, account, onHistory, attachments,requireLogin=false,loginOrigin }) {
    this.attachments = attachments; this.attachmentCapability = null;
    this.connect = connect; this.serviceId = requireText(serviceId, 'serviceId', 200); this.account = requireText(account, 'account', 200);
    this.onHistory = onHistory; this.peer = null; this.connecting = null; this.attached = new Set(); this.listeners = new Map(); this.busy = new Set(); this.opening = new Map();
    this.requireLogin=requireLogin;this.loginOrigin=loginOrigin;this.login=null;this.pendingLogin=null;this.loginRequired=false;
    this.stopped = false; this.reconnectTimer = null; this.reconnectAttempt = 0; this.lastRecoveryError = null;
    this.db = new DatabaseSync(databasePath);
    try {
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS client_mapping(local_id TEXT PRIMARY KEY,service_id TEXT NOT NULL,account TEXT NOT NULL,remote_id TEXT NOT NULL,cursor INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS client_submissions(local_id TEXT NOT NULL,message_id TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(local_id,message_id));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS client_project_selection(local_id TEXT PRIMARY KEY,project_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS client_project_owner(local_id TEXT PRIMARY KEY,service_id TEXT NOT NULL,account TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS client_device(service_id TEXT NOT NULL,account TEXT NOT NULL,device_id TEXT NOT NULL,PRIMARY KEY(service_id,account));
      CREATE TABLE IF NOT EXISTS client_project_commit(local_id TEXT PRIMARY KEY,service_id TEXT NOT NULL,account TEXT NOT NULL,project_id TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,event_seq INTEGER NOT NULL,event_time INTEGER);`);
    this.db.prepare('INSERT OR IGNORE INTO client_device VALUES(?,?,?)').run(this.serviceId,this.account,randomUUID());
    this.deviceId=this.db.prepare('SELECT device_id FROM client_device WHERE service_id=? AND account=?').get(this.serviceId,this.account).device_id;
    // Attribute historical selections only when an authoritative local mapping proves the owner.
    this.db.exec('INSERT OR IGNORE INTO client_project_owner SELECT local_id,service_id,account FROM client_mapping');
    // Unmapped legacy selections have no proved owner and must be confirmed again, not adopted on switch.
    // Device login token stays in the local Host process, never chat, browser storage or mapping SQLite.
    this.db.exec("UPDATE client_submissions SET state='unknown' WHERE state='running'");
    } catch(error) { this.db.close();throw error; }
  }
  assertCurrent(){if(this.isCurrent&&!this.isCurrent())throw new AccessError(-32003,'活动成员配置已丢失或改变；请先退出当前设备并重新选择');}
  async ensureTransport({allowStale=false}={}) {
    if (this.stopped) throw new AccessError(-32001, 'Member client is closed');
    if(!allowStale)this.assertCurrent();
    if (this.peer && !this.peer.closed) return this.peer;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const peer = await this.connect();
      this.attachmentCapability = null;
      try {
        if(!allowStale)this.assertCurrent();
        peer.on('message', m => {
          if (m.id !== undefined) {
            try {
              if (m.method !== 'collaboration/attachment/read' || !this.attachments || !this.attachmentCapability) throw new AccessError(-32601, 'Reverse client methods are unsupported');
              peer.result(m.id, this.attachments.read(m.params ?? {}));
            } catch (error) { peer.error(m.id, error); }
            return;
          }
          if (m.method === 'session/update') this.listeners.get(m.params?.sessionId)?.(m.params);
        });
        const params = initializeParams();
        if (this.attachments) params.clientCapabilities.attachmentTransfer = attachmentCapability();
        const initialized = await peer.request('initialize', params);
        requireInitializeResult(initialized);
        this.attachmentCapability = initialized.agentCapabilities?.attachmentTransfer ?? null;
        if (this.attachmentCapability) requireAttachmentCapability(this.attachmentCapability);
        this.loginRequired=this.requireLogin||initialized.authMethods?.some(m=>m.id==='dingtalk-device');
        if(this.requireLogin&&!initialized.authMethods?.some(m=>m.id==='dingtalk-device'))throw new AccessError(-32011,'Server does not provide required DingTalk authentication; no SSH-only fallback');
        if(!this.loginRequired){
          const identity=await peer.request('collaboration/whoami',{});
          if(identity.account!==this.account||identity.serviceId!==this.serviceId)throw new AccessError(-32003,'Connected identity/service differs from configured entry');
        }
        if(!allowStale)this.assertCurrent();
        if (this.stopped || peer.closed) throw new AccessError(-32001, 'Member client closed during connection');
        this.peer = peer; this.attached.clear(); this.reconnectAttempt = 0;
        peer.on('disconnected', () => { if (this.peer === peer) { this.peer = null; this.attached.clear(); this.scheduleRecovery(); } });
        return peer;
      } catch (error) { peer.close(); throw error; }
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async ensureConnected(){
    const peer=await this.ensureTransport();this.assertCurrent();
    if(this.loginRequired){
      if(!this.login||this.login.expiresAt<=Date.now())throw new AccessError(-32003,'请从设置 → 协作服务完成钉钉扫码登录');
      try{await peer.request('collaboration/login/authenticate',{token:this.login.token,deviceId:this.deviceId});}
      catch(error){if(error.code===-32003){this.login=null;this.attached.clear();this.attachments?.clear();}throw error;}
      const identity=await peer.request('collaboration/whoami',{});
      if(identity.account!==this.account||identity.serviceId!==this.serviceId)throw new AccessError(-32003,'Connected identity/service differs from configured entry');
    }
    this.assertCurrent();return peer;
  }
  async beginLogin(){
    const peer=await this.ensureTransport();if(!this.loginRequired)throw new AccessError(-32011,'Server does not support device login');
    if(!this.loginOrigin)throw new AccessError(-32602,'可信HTTPS登录origin尚未配置');
    const proof=randomBytes(32).toString('base64url'),started=await peer.request('collaboration/login/start',{deviceId:this.deviceId,proof});
    const url=new URL(started.loginUrl);
    if(url.origin!==this.loginOrigin||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.match(/^\/collaboration\/login\/[a-f0-9-]{36}$/))throw new AccessError(-32003,'Untrusted login URL');
    this.pendingLogin={...started,proof};return {requestId:started.requestId,loginUrl:started.loginUrl,expiresAt:started.expiresAt};
  }
  async completeLogin(){
    if(!this.pendingLogin)throw new AccessError(-32003,'请先发起新的扫码登录');
    const peer=await this.ensureTransport(),pending=this.pendingLogin;
    const result=await peer.request('collaboration/login/claim',{requestId:pending.requestId,deviceId:this.deviceId,proof:pending.proof});
    if(result.status==='pending')return {authenticated:false,pending:true};
    if(result.status!=='authenticated'||result.account!==this.account||result.serviceId!==this.serviceId||result.deviceId!==this.deviceId||typeof result.token!=='string')throw new AccessError(-32003,'Device authentication result mismatch');
    this.login=result;this.pendingLogin=null;
    await this.ensureConnected();return this.authStatus();
  }
  authStatus(){return {authenticated:!!this.login&&this.login.expiresAt>Date.now(),account:this.login?.account??null,expiresAt:this.login?.expiresAt??null,serviceId:this.serviceId,pending:!!this.pendingLogin};}
  async verifyAuthStatus(){
    if(!this.authStatus().authenticated)return this.authStatus();
    try{await this.ensureConnected();return this.authStatus();}catch{return {...this.authStatus(),authenticated:false,account:null,expiresAt:null};}
  }
  async logout(){
    const login=this.login;let peer=this.peer;this.login=null;this.pendingLogin=null;this.attached.clear();this.attachments?.clear();clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
    try{if(login)peer=await this.ensureTransport({allowStale:true});if(peer&&!peer.closed)await peer.request('collaboration/login/logout',login?{token:login.token,deviceId:this.deviceId}:{});}
    catch{throw new AccessError(-32001,'本机已退出，服务器撤销尚未确认；请由管理员核对设备状态。');}
    finally{peer?.close();}
    return this.authStatus();
  }
  async projects(){return (await (await this.ensureConnected()).request('collaboration/projects',{})).projects;}
  async communications(projectId,requestId){return (await this.ensureConnected()).request('collaboration/communications',{projectId,...(requestId?{requestId}:{})});}
  selectProject(localId,projectId){
    requireText(localId,'local sessionId',200);requireText(projectId,'projectId',200);
    if(this.pendingProjectSelection(localId))throw new AccessError(-32007,'项目选择结果未确认，请重新打开模型菜单核对。');
    if(this.mapping(localId)||this.busy.has(localId)||this.opening.has(localId))throw new AccessError(-32004,'已有协作会话不能切换项目，请新建本地会话');
    const owner=this.db.prepare('SELECT * FROM client_project_owner WHERE local_id=?').get(localId);
    if(owner&&(owner.service_id!==this.serviceId||owner.account!==this.account))throw new AccessError(-32003,'项目选择属于另一成员／服务，请新建本地会话');
    this.db.prepare('INSERT OR IGNORE INTO client_project_owner VALUES(?,?,?)').run(localId,this.serviceId,this.account);
    this.db.prepare('INSERT INTO client_project_selection VALUES(?,?) ON CONFLICT(local_id) DO UPDATE SET project_id=excluded.project_id').run(localId,projectId);
    return {localId,projectId};
  }
  pendingProjectSelection(localId){return this.db.prepare('SELECT * FROM client_project_commit WHERE local_id=?').get(localId);}
  /** Journal intent before appending the route; publish the project after the session flush succeeds. */
  async commitProjectSelection(localId,projectId,session,route,flush){
    this.assertCurrent();requireText(localId,'local sessionId',200);requireText(projectId,'projectId',200);
    if(typeof flush!=='function')throw new AccessError(-32011,'此Host缺少会话保存能力，请检查DSH版本。');
    if(this.pendingProjectSelection(localId)||this.busy.has(localId)||this.opening.has(localId))throw new AccessError(-32007,'当前会话正在操作或选择结果未确认。');
    const old=this.selectedProject(localId),mapped=this.mapping(localId),owner=this.db.prepare('SELECT * FROM client_project_owner WHERE local_id=?').get(localId);
    if(owner&&(owner.service_id!==this.serviceId||owner.account!==this.account))throw new AccessError(-32003,'项目选择属于另一成员／服务，请新建会话。');
    if(mapped&&old!==projectId)throw new AccessError(-32004,'已有远端会话不能切换项目，请新建会话。');
    const seq=(session.snapshotEvents().at(-1)?.seq??-1)+1;
    this.db.prepare('INSERT INTO client_project_commit VALUES(?,?,?,?,?,?,?,NULL)').run(localId,this.serviceId,this.account,projectId,route.provider,route.model,seq);
    let event;try{event=session.append('model/selection',route);}catch(error){this.db.prepare('DELETE FROM client_project_commit WHERE local_id=?').run(localId);throw error;}
    try{
      this.db.prepare('UPDATE client_project_commit SET event_seq=?,event_time=? WHERE local_id=?').run(event.seq,event.time,localId);
      if(await flush(session)===false)throw new Error('Session durability unavailable');
      const latest=session.snapshotEvents().findLast(value=>value.type==='model/selection');
      if(latest?.seq!==event.seq){this.db.prepare('DELETE FROM client_project_commit WHERE local_id=?').run(localId);throw new AccessError(-32007,'选择期间模型已改变，保留原项目；请重新展开菜单。');}
      this.reconcileProjectSelection(localId,session);if(this.pendingProjectSelection(localId))throw new Error('Selection journal not settled');
    }catch(error){if(error.code===-32007)throw error;throw new AccessError(-32012,'项目选择结果未确认，请重新打开模型菜单核对；不要发送消息。');}
    return{localId,projectId};
  }
  /** Recover an interrupted two-store commit from its exact logged selection; otherwise fail closed. */
  reconcileProjectSelection(localId,session){
    const row=this.pendingProjectSelection(localId);if(!row)return;
    if(row.service_id!==this.serviceId||row.account!==this.account)throw new AccessError(-32003,'未确认项目选择属于另一成员／服务。');
    const owner=this.db.prepare('SELECT * FROM client_project_owner WHERE local_id=?').get(localId);
    if(owner&&(owner.service_id!==this.serviceId||owner.account!==this.account))throw new AccessError(-32012,'项目选择归属与日志不一致，请新建会话并联系管理员核对。');
    const event=session.snapshotEvents().find(value=>value.seq===row.event_seq);
    if(!event){this.db.prepare('DELETE FROM client_project_commit WHERE local_id=?').run(localId);return;}
    if(row.event_time===null||event.time!==row.event_time||event.type!=='model/selection'||event.data.provider!==row.provider||event.data.model!==row.model||event.data.reasoningEffort!==undefined)throw new AccessError(-32012,'项目选择日志与本机记录不一致，请新建会话并联系管理员核对。');
    if(session.snapshotEvents().findLast(value=>value.type==='model/selection')?.seq!==row.event_seq){this.db.prepare('DELETE FROM client_project_commit WHERE local_id=?').run(localId);return;}
    this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT OR IGNORE INTO client_project_owner VALUES(?,?,?)').run(localId,this.serviceId,this.account);
      this.db.prepare('INSERT INTO client_project_selection VALUES(?,?) ON CONFLICT(local_id) DO UPDATE SET project_id=excluded.project_id').run(localId,row.project_id);
      this.db.prepare('DELETE FROM client_project_commit WHERE local_id=?').run(localId);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  selectedProject(localId){
    const owner=this.db.prepare('SELECT * FROM client_project_owner WHERE local_id=?').get(localId);
    if(!owner||owner.service_id!==this.serviceId||owner.account!==this.account)return null;
    return this.db.prepare('SELECT project_id FROM client_project_selection WHERE local_id=?').get(localId)?.project_id??null;
  }
  async legacyHistory(localId){const row=this.mapping(localId);if(!row)throw new AccessError(-32004,'No saved conversation');return (await this.ensureConnected()).request('collaboration/history',{sessionId:row.remote_id,after:0});}
  wasSubmitted(localId, messageId) { return !!this.db.prepare('SELECT 1 FROM client_submissions WHERE local_id=? AND message_id=?').get(localId, messageId); }
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
    if(this.pendingProjectSelection(localId))throw new AccessError(-32012,'项目选择结果未确认，请重新打开模型菜单核对。');
    const peer = await this.ensureConnected(); let row = this.mapping(localId);
    if (!row) {
      const projectId=this.selectedProject(localId);
      if(this.loginRequired&&!projectId)throw new AccessError(-32004,'请先打开模型菜单，在 Collaboration 分组明确选择当前会话项目');
      const result = await peer.request('session/new', this.loginRequired?{projectId}:{});
      this.db.prepare('INSERT INTO client_mapping VALUES(?,?,?,?,0)').run(localId, this.serviceId, this.account, result.sessionId);
      row = this.mapping(localId); this.attached.add(row.remote_id);
    } else if (!this.attached.has(row.remote_id)) {
      // Explicit failure: never replace this mapping or replay conversation history.
      await peer.request('session/load', { sessionId: row.remote_id });
      this.attached.add(row.remote_id);
    }
    const history = await peer.request('collaboration/history', { sessionId: row.remote_id, after: Number(row.cursor) });
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
  async prompt(localId, { messageId, text, signal, onUpdate, attachmentEntry }) {
    requireText(messageId, 'messageId', 200); requireText(text, 'user text', 256 * 1024);
    if (this.busy.has(localId)) throw new AccessError(-32007, 'Local conversation already running');
    const previous = this.db.prepare('SELECT state FROM client_submissions WHERE local_id=? AND message_id=?').get(localId, messageId);
    if (previous) throw new AccessError(-32005, 'This message was already submitted. Restore history; do not automatically retry.', { state: previous.state });
    this.busy.add(localId);
    let row, peer, sent = false;
    try {
      ({ row, peer } = await this.open(localId));this.assertCurrent();
      if (signal?.aborted) throw new AccessError(-32010, 'Cancelled before submission');
      if (attachmentEntry) requireAttachmentCapability(this.attachmentCapability);
      this.db.prepare('INSERT INTO client_submissions VALUES(?,?,?)').run(localId, messageId, 'running');
      const requestId = createHash('sha256').update(`${this.serviceId}\0${this.account}\0${localId}\0${messageId}`).digest('hex');
      this.listeners.set(row.remote_id, notification => {
        onUpdate?.(notification.update); this.advance(localId, notification._meta?.sequence);
      });
      const abort = () => { if (!peer.closed) peer.notify('session/cancel', { sessionId: row.remote_id }); };
      signal?.addEventListener('abort', abort, { once: true });
      const release = attachmentEntry ? this.attachments.bind(row.remote_id, requestId, attachmentEntry, signal) : () => {};
      sent = true;
      try {
        const meta = { requestId, ...(attachmentEntry ? { attachments: attachmentEntry.items.map(item => item.manifest) } : {}) };
        const result = await peer.request('session/prompt', { sessionId: row.remote_id, prompt: [{ type: 'text', text }], _meta: meta }, { timeoutMs: 0 });
        this.db.prepare('UPDATE client_submissions SET state=? WHERE local_id=? AND message_id=?').run(result.stopReason, localId, messageId);
        return result;
      } finally { release(); signal?.removeEventListener('abort', abort); }
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
    if(this.isCurrent&&!this.isCurrent())return;
    if (this.stopped || this.reconnectTimer || (this.loginRequired&&(!this.login||this.login.expiresAt<=Date.now()))) return;
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
  close() { this.stopped = true; clearTimeout(this.reconnectTimer); this.reconnectTimer = null; this.disconnect(); this.attachments?.clear(); this.db.close(); }
}
