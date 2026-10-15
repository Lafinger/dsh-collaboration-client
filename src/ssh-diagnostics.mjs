import {AccessError} from'./protocol.mjs';

// Only fixed diagnoses leave Host memory. Never return raw remote stderr, paths, argv, tokens or proof.
const reasons=[
 ['host-key-changed',/REMOTE HOST IDENTIFICATION HAS CHANGED/i,'SSH服务器主机指纹已改变；请由管理员通过可信渠道核验，不要关闭严格校验。'],
 ['host-key-check',/Host key verification failed|No .* host key is known .*strict checking/i,'SSH主机指纹校验失败；请由管理员核验known_hosts记录，不要关闭严格校验。'],
 ['local-key',/Identity file .*not accessible|Load key .*invalid format|Load key .*Permission denied|bad permissions|UNPROTECTED PRIVATE KEY FILE|sign_and_send_pubkey: signing failed|Load key .*passphrase/i,'本机私钥文件不可用或无法用于非交互认证；请核对文件权限、有效性与部署要求，不要提交私钥正文。'],
 ['publickey',/Permission denied \([^\r\n]*publickey[^\r\n]*\)|No more authentication methods to try/i,'SSH公钥认证失败；请由管理员核对成员账号、授权公钥及账号准入，钉钉扫码尚未开始。'],
 ['network-refused',/connect to host .*Connection refused/i,'SSH连接被拒绝；请核对服务器SSH监听、发布端口与防火墙。'],
 ['network-timeout',/connect to host .*Connection timed out|Connection timed out during banner exchange|Operation timed out/i,'SSH网络连接超时；请核对服务器、端口与网络可达性。'],
 ['network-unreachable',/No route to host|Network is unreachable/i,'SSH网络不可达；请核对路由及网络连接。'],
 ['resolve-host',/Could not resolve hostname/i,'SSH服务器地址无法解析；请核对地址及DNS。'],
 ['remote-protocol',/collaboration connector:.*(?:protocol version mismatch|Unsupported ACP-shaped base protocol version)/i,'远端协作协议版本不匹配；请管理员核对connector与协作服务的配套版本，不允许降级回退。'],
 ['connector-credential',/collaboration connector:.*(?:credential must be|credential does not match|requires a deployment-local socket path)/i,'远端connector凭据权限或账号配置校验失败；请管理员核对root所有权、组、0440权限与当前SSH账号。'],
 ['connector-socket',/collaboration connector:.*(?:connect ENOENT|connect ECONNREFUSED|connect EACCES)/i,'远端协作服务socket不可用或权限不足；请管理员核对协作Host运行状态与connector接入。'],
 ['remote-command',/(?:collaboration-connect|node|connector-cli\.mjs)[^\r\n]*(?:not found|No such file)|(?:command not found)[^\r\n]*(?:collaboration-connect|node)/i,'远端固定接入命令启动失败；请管理员核对forced-command、Node程序与connector安装。'],
];
const methodPhase=method=>method==='initialize'?'initialize':/^collaboration\/(?:login\/(?:start|claim|authenticate|logout)|whoami|projects)$/.test(method)?method:/^session\/(?:new|load|prompt)$/.test(method)?method:'协作请求';

/** Bounded in-memory classifier; early recognized reason survives a long later tail. */
export class SshDiagnostics {
 constructor(){this.tail='';this.reason=null;this.phase='SSH启动';}
 request(method){this.phase=methodPhase(method);}
 push(chunk){this.tail=(this.tail+String(chunk)).slice(-8192);for(let i=0;i<reasons.length;i++){if(reasons[i][1].test(this.tail)&&(!this.reason||i<this.reason.index))this.reason={index:i,id:reasons[i][0],message:reasons[i][2]};}}
 clear(){this.tail='';}
 error({exitCode,signal,protocol=false}={}){
  const reason=protocol?{id:'invalid-protocol',message:'SSH通道收到非预期或超限协议内容；请管理员核对远端输出是否为纯NDJSON协议，普通输出不得写入stdout。'}:this.reason??{id:'ended',message:'SSH／远端连接提前结束，具体原因尚未确认；请管理员核对SSH日志及远端connector／协作Host日志。'};
  const code=Number.isInteger(exitCode)?exitCode:null,termination=code!==null?`；SSH退出码 ${code}`:typeof signal==='string'&&/^SIG[A-Z0-9]+$/.test(signal)?`；SSH终止信号 ${signal}`:'；SSH退出码未取得';
  return new AccessError(-32001,`${reason.message}（阶段 ${this.phase}${termination}；未自动重试）`,{kind:'ssh-transport',reason:reason.id,phase:this.phase,exitCode:code});
 }
}
export function sshSpawnError(error){return new AccessError(-32001,error?.code==='ENOENT'?'未找到本机SSH程序；请核对OpenSSH安装或sshExecutable绝对路径。':'本机SSH程序无法启动；请核对程序路径与执行权限。',{kind:'ssh-transport',reason:'spawn'});}
