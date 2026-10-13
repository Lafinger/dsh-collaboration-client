import { EventEmitter } from 'node:events';
import { AccessError, collaborationMeta, requireCollaborationVersion } from '../../src/protocol.mjs';

// Client contract fixture only; no server source, signing credentials, business tools or Agent runtime.
export class FakeService {
  constructor() { this.sessions = new Map(); this.opens = 0; this.prompts = []; this.next = 1; }
  connect({ account = 'alice', serviceId = 'fixture-service' } = {}) {
    const service = this;
    return new class extends EventEmitter {
      closed = false;
      attached = new Set();
      async request(method, params) {
        if (this.closed) throw new AccessError(-32001, 'Connection closed');
        if (method === 'initialize') {
          requireCollaborationVersion(params);
          if(params.protocolVersion!==1)throw new AccessError(-32011,'Unsupported base protocol');
          return { protocolVersion: 1, _meta: collaborationMeta() };
        }
        if (method === 'collaboration/whoami') return { account, serviceId };
        if (method === 'session/new') {
          const id = `remote-${service.next++}`; service.opens++;
          service.sessions.set(id, { owner: account, events: [], status: null, connection: this }); this.attached.add(id); return { sessionId: id };
        }
        const session = service.sessions.get(params.sessionId);
        if (!session || session.owner !== account) throw new AccessError(-32004, 'Session not available to this account');
        if (method === 'session/load') {
          if (session.connection && session.connection !== this && !session.connection.closed) throw new AccessError(-32007, 'Session already attached');
          session.connection = this; this.attached.add(params.sessionId); return {};
        }
        if (method === 'collaboration/history') return { events: session.events.filter(e => e.seq > params.after), status: session.status };
        if (method === 'session/close') { session.connection = null; this.attached.delete(params.sessionId); return {}; }
        if (method === 'session/prompt') {
          service.prompts.push(params); session.status = { state: 'completed', requestId: params._meta.requestId };
          const update = { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `reply:${params.prompt[0].text}` } };
          const seq = session.events.length + 1; session.events.push({ seq, update });
          this.emit('message', { method: 'session/update', params: { sessionId: params.sessionId, update, _meta: { sequence: seq } } });
          return { stopReason: 'end_turn' };
        }
        throw new Error(`Unsupported fixture method ${method}`);
      }
      notify(method, params) { if (method === 'session/cancel') this.cancelled = params.sessionId; }
      error() {}
      close() { if (this.closed) return; this.closed = true; for (const id of this.attached) service.sessions.get(id).connection = null; this.emit('disconnected'); }
    }();
  }
}
