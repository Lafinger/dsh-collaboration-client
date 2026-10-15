// Historical contract fixture only: not selectable via production config or a network fallback.
import {MemberConnection} from '../../src/member-connection.mjs';
export function installLegacyConnection(ctx){ctx.provide('collaborationLegacyTestConnection',MemberConnection);}
