// ChatGPT 路由检测 · Page Hook (v2.5.6)
// 在页面主世界运行，直接钩 fetch/WebSocket 并通过 postMessage 把观测回传给 content script
(() => {
  if (window.__CKNB_ROUTE_HOOK__) return;
  window.__CKNB_ROUTE_HOOK__ = true;
  const POW_PATHS = new Set([
    '/backend-api/sentinel/chat-requirements/prepare',
    '/backend-anon/sentinel/chat-requirements/prepare',
    '/api/sentinel/chat-requirements/prepare',
    '/backend-api/sentinel/chat-requirements',
    '/backend-anon/sentinel/chat-requirements',
    '/api/sentinel/chat-requirements'
  ]);
  const EMPTY = Object.freeze({
    requestedModel: null, responseModelSlug: null, defaultModelSlug: null,
    resolvedModelSlug: null, serverModelSlug: null, domModelSlug: null,
    requestBody: null, requestHeaders: null, requestUrl: null, clientIp: null, fingerprint: null,
    thinkingEffort: null, planType: null, requestId: null, conversationId: null,
    conversationMode: null, selectedSourcesCount: null, toolInvoked: null,
    toolName: null, isSearch: null, hadImage: null, fastConvo: null
  });

  const ROUTE_MAX_REQUEST_BODY = 8192;
  function collectFingerprint(){ try{ const nav=navigator; const scr=window.screen||{}; return {userAgent:nav.userAgent||null, platform:nav.platform||null, language:nav.language||null, languages:Array.isArray(nav.languages)?nav.languages.slice(0,5):null, timezone:(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||null;}catch{return null;}})(), timezoneOffset:new Date().getTimezoneOffset(), screen:scr.width&&scr.height?`${scr.width}x${scr.height}`:null, viewport:`${window.innerWidth}x${window.innerHeight}`, hardwareConcurrency:nav.hardwareConcurrency||null, deviceMemory:nav.deviceMemory||null, cookieEnabled:nav.cookieEnabled, doNotTrack:nav.doNotTrack||null, vendor:nav.vendor||null}; }catch{return null;} }
  let routeClientIpCache=null; let routeClientIpFetching=false;
  function fetchClientIp(){ if(routeClientIpCache||routeClientIpFetching) return; routeClientIpFetching=true; const traceUrl=location.origin+'/cdn-cgi/trace'; const tryIpify=()=>{ try{ fetch('https://api64.ipify.org?format=json',{method:'GET'}).then(r=>r.json()).then(j=>{if(j&&j.ip){routeClientIpCache=j.ip; try{localStorage.setItem('cknb-route:ip:v1',j.ip);}catch{}} routeClientIpFetching=false;}).catch(()=>{routeClientIpFetching=false;}); }catch{routeClientIpFetching=false;} }; try{ try{const cached=localStorage.getItem('cknb-route:ip:v1'); if(cached&&/^[\d.:a-fA-F]+$/.test(cached)){routeClientIpCache=cached; routeClientIpFetching=false; return;}}catch{} fetch(traceUrl,{method:'GET',cache:'no-store'}).then(r=>r.text()).then(txt=>{const m=txt.match(/^ip=(.+)$/m); if(m&&m[1]){routeClientIpCache=m[1].trim(); try{localStorage.setItem('cknb-route:ip:v1',routeClientIpCache);}catch{}} else tryIpify(); routeClientIpFetching=false;}).catch(()=>{tryIpify();}); }catch{tryIpify();} }
  function getClientIp(){ return routeClientIpCache || (()=>{try{return localStorage.getItem('cknb-route:ip:v1');}catch{return null;}})() || null; }
  function truncateBody(raw){ if(typeof raw!=='string') return null; if(raw.length<=ROUTE_MAX_REQUEST_BODY) return raw; return raw.slice(0,ROUTE_MAX_REQUEST_BODY)+`\n…(truncated ${raw.length-ROUTE_MAX_REQUEST_BODY} chars)`; }
  function serializeHeaders(init){ try{ const h=init&&init.headers; if(!h) return null; if(h instanceof Headers){ const o={}; h.forEach((v,k)=>{o[k]=v;}); return o; } if(typeof h==='object') return {...h}; return null; }catch{return null;} }
  try{ fetchClientIp(); }catch{}
  const MAX_STREAM = 1024*1024, MAX_RECORD=8*1024*1024, MAX_POW=256*1024, MAX_WS_FRAME=2*1024*1024, MAX_WS_ITEM=1024*1024;
  const CAPTURE_TTL=10*60*1000;
  function asRecord(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:null}
  function sVal(v){return typeof v==='string'&&v.length?v:null}
  function bVal(v){return typeof v==='boolean'?v:null}
  function blank(){return{...EMPTY}}
  function merge(...items){const o=blank();for(const it of items){if(!it)continue;for(const k of Object.keys(EMPTY)){if(it[k]!==null&&it[k]!==undefined)o[k]=it[k]}}return o}
  function extractMetadata(rec,kind='none'){
    if(!rec) return {};
    const model=sVal(rec.model_slug);
    return { responseModelSlug: kind==='assistant'?model:null, serverModelSlug: kind==='server'?model:null, defaultModelSlug:sVal(rec.default_model_slug), resolvedModelSlug:sVal(rec.resolved_model_slug), planType:sVal(rec.plan_type), requestId:sVal(rec.request_id), conversationId:sVal(rec.conversation_id), toolInvoked:bVal(rec.tool_invoked), toolName:sVal(rec.tool_name), isSearch:bVal(rec.is_search), hadImage:bVal(rec.did_prompt_contain_image), fastConvo:bVal(rec.fast_convo) };
  }
  function walk(value,out=blank(),depth=0,budget={n:0}){
    if(depth>10||budget.n++>3000) return out;
    if(Array.isArray(value)){for(const it of value) out=walk(it,out,depth+1,budget);return out}
    const rec=asRecord(value); if(!rec) return out;
    const meta=asRecord(rec.metadata);
    if(rec.type==='server_ste_metadata'&&meta) out=merge(out,extractMetadata(meta,'server'));
    else { out=merge(out,extractMetadata(rec)); if(meta){const author=asRecord(rec.author); out=merge(out,extractMetadata(meta,author&&author.role==='assistant'?'assistant':'none'))}}
    if(typeof rec.conversation_id==='string') out.conversationId=rec.conversation_id;
    for(const [k,nested] of Object.entries(rec)){ if(rec.type==='server_ste_metadata'&&k==='metadata') continue; if(nested&&typeof nested==='object') out=walk(nested,out,depth+1,budget)}
    return out;
  }
  function parseSseText(raw){let f=blank();for(const line of raw.split(/\r?\n/)){if(!line.startsWith('data:'))continue;const payload=line.slice(5).trim();if(!payload||payload==='[DONE]')continue; try{f=walk(JSON.parse(payload),f)}catch{}}return f}
  function msgFields(message){const meta=asRecord(message&&message.metadata); if(!meta) return blank(); const author=asRecord(message.author); let f=merge(blank(),extractMetadata(meta,author&&author.role==='assistant'?'assistant':'none')); const ste=asRecord(meta.server_ste_metadata); if(ste) f=merge(f,extractMetadata(ste,'server')); return f}
  function parseConversationRecord(value){
    const root=asRecord(value); const mapping=asRecord(root&&root.mapping); if(!mapping) return [];
    const nodes=[],byId=new Map();
    for(const [key,raw] of Object.entries(mapping)){
      const node=asRecord(raw); const message=asRecord(node&&node.message); const author=asRecord(message&&message.author);
      const entry={key, id:sVal(message&&message.id)||key, parent:sVal(node&&node.parent), role:sVal(author&&author.role), fields: message?msgFields(message):blank()};
      nodes.push(entry); byId.set(key,entry); byId.set(entry.id,entry);
    }
    const combineParents=(node)=>{
      let fields=node.fields; let parent=node.parent; const seen=new Set([node.key,node.id]);
      for(let i=0;parent&&i<64;i++){ if(seen.has(parent)) break; seen.add(parent); const p=byId.get(parent); if(!p) break; fields=merge(p.fields,fields); if(p.role==='user') break; parent=p.parent }
      return fields;
    };
    const current=sVal(root.current_node);
    if(current){
      let node=byId.get(current)||null; const seen=new Set();
      for(let i=0;node&&i<64;i++){ if(seen.has(node.key)) break; seen.add(node.key); if(node.role==='assistant'){ const f=combineParents(node); if(f.responseModelSlug||f.resolvedModelSlug||f.serverModelSlug) return [f]; break } node=node.parent?(byId.get(node.parent)||null):null }
    }
    const found=[],seenReq=new Set();
    for(const node of nodes){ if(node.role!=='assistant') continue; const f=combineParents(node); if(!(f.responseModelSlug||f.resolvedModelSlug||f.serverModelSlug)) continue; const k=f.requestId||node.id; if(seenReq.has(k)) continue; seenReq.add(k); found.push(f)}
    return found;
  }
  function parseResponseText(raw){ if(/^\s*data:/m.test(raw)) return [parseSseText(raw)]; try{ const p=JSON.parse(raw); const c=parseConversationRecord(p); return c.length?c:[walk(p)] }catch{return []}}
  function parseRequest(raw){ try{ const obj=asRecord(JSON.parse(raw)); if(!obj) return{fields:blank(),correlation:{}}; const mode=asRecord(obj.conversation_mode); const messages=Array.isArray(obj.messages)?obj.messages:[]; const first=asRecord(messages[0]); const bounded=v=>typeof v==='string'&&v.length>0&&v.length<=512?v:null; return{fields:merge(blank(),{requestedModel:sVal(obj.model),thinkingEffort:sVal(obj.thinking_effort),conversationId:sVal(obj.conversation_id),conversationMode:sVal(mode&&mode.kind)}),correlation:{conversationId:bounded(obj.conversation_id),inputMessageId:bounded(first&&first.id),parentMessageId:bounded(obj.parent_message_id)}} }catch{return{fields:blank(),correlation:{}}}}
  function hasEvidence(f){return Boolean(f&&(f.responseModelSlug||f.resolvedModelSlug||f.serverModelSlug))}
  function sig(f){return JSON.stringify([f.requestedModel,f.responseModelSlug,f.defaultModelSlug,f.resolvedModelSlug,f.serverModelSlug,f.requestId,f.planType])}
  function boundedId(v){return typeof v==='string'&&v.length>0&&v.length<=512?v:null}
  function classify(raw){
    try{ const url=new URL(raw,location.href); if(url.origin!==location.origin) return{kind:'other'}; const path=url.pathname.length>1?url.pathname.replace(/\/$/,''):url.pathname; if(path==='/backend-api/f/conversation') return{kind:'stream'}; if(POW_PATHS.has(path)) return{kind:'pow'}; const m=/^\/backend-api\/conversation\/([^/]+)$/.exec(url.pathname); if(m) return{kind:'record',conversationId:decodeURIComponent(m[1])} }catch{}
    return{kind:'other'}
  }
  const pending=new Map();
  function prune(){const now=Date.now(); for(const [id,it] of pending) if(it.expiresAt<=now) pending.delete(id)}
  function register(id,startedAt,correlation){
    if(!correlation||(!correlation.conversationId&&!correlation.inputMessageId&&!correlation.parentMessageId)) return;
    prune(); while(pending.size>=32) pending.delete(pending.keys().next().value);
    pending.set(id,{id,startedAt,expiresAt:Date.now()+CAPTURE_TTL,conversationId:correlation.conversationId||null,inputMessageId:correlation.inputMessageId||null,parentMessageId:correlation.parentMessageId||null,fields:blank(),lastSig:''})
  }
  function emit(id,source,mode,phase,fields,startedAt,completedAt=null){
    const obs={id,source,mode,phase,fields,observedAt:new Date().toISOString(),startedAt,completedAt,pagePath:location.pathname};
    window.postMessage({source:'cknb-route-inspector',type:'observation',observation:obs}, location.origin);
  }
  function findPow(value){
    const root=asRecord(value); if(!root) return null;
    const roots=[root,asRecord(root.chat_requirements),asRecord(root.requirements)].filter(Boolean);
    for(const cand of roots){ const pow=asRecord(cand.proofofwork)||asRecord(cand.proof_of_work)||asRecord(cand.pow); const raw=typeof pow?.difficulty==='string'?pow.difficulty.trim():''; if(!raw||raw.length>256) continue; const m=/^(?:0[xX])?([0-9a-fA-F]+)$/.exec(raw); if(!m) continue; try{return{rawHex:raw,decimal:BigInt('0x'+m[1]).toString(10)}}catch{}}
    return null;
  }
  async function getBody(input,init){
    if(init&&typeof init.body==='string') return init.body;
    if(input instanceof Request){ try{return await input.clone().text()}catch{return null}}
    return null;
  }
  async function parseSse(response,id,startedAt,base){
    const body=response.body; if(!body) return;
    const reader=body.getReader(); const dec=new TextDecoder(); let buf=''; let fields=merge(blank(),base); let last=sig(fields);
    while(true){
      const{value,done}=await reader.read();
      buf+=dec.decode(value,{stream:!done});
      if(buf.length>MAX_STREAM&&!buf.includes('\n')){try{await reader.cancel()}catch{}return}
      const lines=buf.split(/\r?\n/); buf=lines.pop()||'';
      for(const line of lines){
        if(line.length>MAX_STREAM||!line.startsWith('data:')) continue;
        const p=parseSseText(line); fields=merge(fields,p); const s=sig(fields); if(s!==last){last=s; emit(id,'fetch','live','responding',fields,startedAt)}
      }
      if(done) break;
    }
    if(buf.startsWith('data:')) fields=merge(fields,parseSseText(buf));
    emit(id,'fetch','live','completed',fields,startedAt,new Date().toISOString());
  }
  async function parseRecord(response,id,startedAt,conversationId){
    const declared=Number(response.headers.get('content-length')||0); if(declared>MAX_RECORD) return;
    const raw=await response.text(); if(raw.length>MAX_RECORD) return;
    const results=parseResponseText(raw).filter(hasEvidence);
    results.forEach((fields,i)=> emit(`${id}:${fields.requestId||i}`,'reload','reload','completed',merge(fields,{conversationId:conversationId||fields.conversationId}),startedAt,new Date().toISOString()));
  }
  async function parsePow(response){
    const declared=Number(response.headers.get('content-length')||0); if(declared>MAX_POW) return;
    const raw=await response.text(); if(raw.length>MAX_POW) return;
    let parsed; try{parsed=JSON.parse(raw)}catch{return}
    const d=findPow(parsed); if(!d) return;
    window.postMessage({source:'cknb-route-inspector',type:'pow',pow:{...d,observedAt:new Date().toISOString()}}, location.origin);
  }
  function captureId(){ try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID()}catch{} return `cknb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}
  // fetch hook
  (function(){
    const native=window.fetch;
    async function inspect(downstream,receiver,input,init){
      const url=input instanceof Request?input.url:String(input);
      const ep=classify(url);
      if(ep.kind==='other') return downstream.call(receiver,input,init);
      const id=captureId(),startedAt=new Date().toISOString();
      const _detailed={requestBody:null, requestHeaders:serializeHeaders(init), requestUrl:(input instanceof Request?input.url:String(input)), clientIp:getClientIp(), fingerprint:collectFingerprint()};
      let reqPromise=Promise.resolve(blank());
      if(ep.kind==='stream'){
        reqPromise=getBody(input,init).then(raw=>{
          if(raw) _detailed.requestBody=truncateBody(raw);
          if(!raw) return blank();
          const p=parseRequest(raw); const detailedFields={...p.fields, requestBody:_detailed.requestBody, requestHeaders:_detailed.requestHeaders, requestUrl:_detailed.requestUrl, clientIp:_detailed.clientIp, fingerprint:_detailed.fingerprint}; register(id,startedAt,p.correlation); const _pend=pending.get(id); if(_pend) _pend.fields={...detailedFields}; emit(id,'fetch','live','requested',detailedFields,startedAt); return detailedFields;
        }).catch(()=>blank());
      }
      const resp=await downstream.call(receiver,input,init);
      let clone; try{clone=resp.clone()}catch{return resp}
      if(ep.kind==='pow') parsePow(clone).catch(()=>{});
      else if(ep.kind==='stream') reqPromise.then(f=>parseSse(clone,id,startedAt,f)).catch(()=>{});
      else if(ep.kind==='record') parseRecord(clone,id,startedAt,ep.conversationId).catch(()=>{});
      return resp;
    }
    function makeGen(downstream,captures){
      const gen={downstream,captures,wrapper:null};
      gen.wrapper=async function(input,init){ const rec=this??window; if(gen.captures) return inspect(gen.downstream,rec,input,init); return gen.downstream.call(rec,input,init)};
      try{Object.defineProperty(gen.wrapper,'name',{value:'fetch',configurable:true}); const t=Function.prototype.toString.call(downstream); Object.defineProperty(gen.wrapper,'toString',{value:()=>t,configurable:true})}catch{}
      return gen;
    }
    let current=makeGen(native,true);
    function adopt(c){ if(typeof c!=='function'||c===current.wrapper) return; current=makeGen(c,c===native)}
    const getter=()=>current.wrapper, setter=c=>adopt(c);
    function ensure(){
      try{
        const d=Object.getOwnPropertyDescriptor(window,'fetch');
        if(d&&d.get===getter&&d.set===setter) return;
        adopt(window.fetch);
        Object.defineProperty(window,'fetch',{configurable:true,enumerable:d?.enumerable??true,get:getter,set:setter});
      }catch{ try{window.fetch=current.wrapper}catch{}}
    }
    ensure(); queueMicrotask(ensure); document.addEventListener('DOMContentLoaded',ensure,{once:true}); window.addEventListener('load',ensure,{once:true}); setInterval(ensure,1500);
  })();
  // websocket hook
  (function(){
    const Native=window.WebSocket;
    if(!Native) return;
    const observed=new WeakSet();
    function isChat(url){ try{ const u=new URL(url,location.href); return (u.protocol==='ws:'||u.protocol==='wss:')&&(u.hostname==='chatgpt.com'||u.hostname.endsWith('.chatgpt.com')||u.hostname==='openai.com'||u.hostname.endsWith('.openai.com')) }catch{return false}}
    function bounded(v){return typeof v==='string'&&v.length>0&&v.length<=512?v:null}
    function addUnique(list,v){ if(v&&list.length<8&&!list.includes(v)) list.push(v)}
    function collect(value,acc,depth=0){
      if(depth>8||acc.visited++>500) return;
      if(Array.isArray(value)){ for(const it of value.slice(0,32)) collect(it,acc,depth+1); return}
      const rec=asRecord(value); if(!rec) return;
      addUnique(acc.conversationIds,bounded(rec.conversation_id)); addUnique(acc.parentIds,bounded(rec.parent_id)); addUnique(acc.parentIds,bounded(rec.parent));
      if(asRecord(rec.author)) addUnique(acc.messageIds,bounded(rec.id));
      const msg=asRecord(rec.message); if(msg) addUnique(acc.messageIds,bounded(msg.id));
      if(rec.type==='server_ste_metadata') acc.terminal=true;
      for(const nested of Object.values(rec)) if(nested&&typeof nested==='object') collect(nested,acc,depth+1);
    }
    function parseWs(raw){
      if(!raw||raw.length>MAX_WS_FRAME) return [];
      let parsed; try{parsed=JSON.parse(raw)}catch{return []}
      if(!Array.isArray(parsed)) return [];
      const out=[];
      for(const env of parsed.slice(0,16)){
        const encoded=asRecord(asRecord(asRecord(env)?.payload)?.payload)?.encoded_item;
        if(typeof encoded!=='string'||!encoded||encoded.length>MAX_WS_ITEM) continue;
        const acc={conversationIds:[],messageIds:[],parentIds:[],terminal:false,visited:0};
        for(const line of encoded.split(/\r?\n/)){
          if(!line.startsWith('data:')) continue;
          const payload=line.slice(5).trim(); if(!payload) continue; if(payload==='[DONE]'){acc.terminal=true; continue}
          try{collect(JSON.parse(payload),acc)}catch{}
        }
        const f=parseSseText(encoded); addUnique(acc.conversationIds,f.conversationId);
        out.push({fields:f,...acc});
      }
      return out;
    }
    function select(ev){
      prune(); const all=[...pending.values()]; const uniq=a=>a.length===1?a[0]:null;
      let m=all.filter(p=>p.inputMessageId&&(ev.messageIds.includes(p.inputMessageId)||ev.parentIds.includes(p.inputMessageId))); if(m.length) return uniq(m);
      m=all.filter(p=>p.parentMessageId&&ev.parentIds.includes(p.parentMessageId)&&(!ev.conversationIds.length||!p.conversationId||ev.conversationIds.includes(p.conversationId))); if(m.length) return uniq(m);
      m=all.filter(p=>p.conversationId&&ev.conversationIds.includes(p.conversationId)); return uniq(m);
    }
    function handle(raw){
      const groups=new Map();
      for(const ev of parseWs(raw)){
        const p=select(ev); if(!p) continue;
        if(!p.conversationId&&ev.conversationIds.length===1) p.conversationId=ev.conversationIds[0]||null;
        const cur=groups.get(p.id);
        groups.set(p.id,{pending:p,fields:merge(cur?.fields||p.fields,ev.fields,{conversationId:p.conversationId}),terminal:Boolean(cur?.terminal||ev.terminal)});
      }
      for(const{pending:p,fields,terminal} of groups.values()){
        p.fields=fields; const s=sig(fields);
        if(hasEvidence(fields)&&(s!==p.lastSig||terminal)){ p.lastSig=s; emit(p.id,'websocket','live',terminal?'completed':'responding',fields,p.startedAt,terminal?new Date().toISOString():null)}
        if(terminal) pending.delete(p.id);
      }
    }
    function observe(socket){
      if(observed.has(socket)||!isChat(socket.url)) return;
      observed.add(socket);
      socket.addEventListener('message',e=>{ if(typeof e.data==='string') queueMicrotask(()=>handle(e.data))});
    }
    function shape(wrapper,down){
      try{Object.setPrototypeOf(wrapper,Object.getPrototypeOf(down))}catch{}
      try{Object.defineProperty(wrapper,'prototype',{value:down.prototype,writable:false,enumerable:false,configurable:false})}catch{}
      try{Object.defineProperty(wrapper,'name',{value:'WebSocket',configurable:true})}catch{}
      for(const k of ['CONNECTING','OPEN','CLOSING','CLOSED']){ const d=Object.getOwnPropertyDescriptor(down,k)||Object.getOwnPropertyDescriptor(Native,k); if(!d) continue; try{Object.defineProperty(wrapper,k,d)}catch{}}
      try{const t=Function.prototype.toString.call(down); Object.defineProperty(wrapper,'toString',{value:()=>t,configurable:true})}catch{}
    }
    function makeGen(down,captures){
      const g={downstream:down,captures,wrapper:null};
      g.wrapper=function(url,protocols){
        if(!new.target) throw new TypeError("Failed to construct 'WebSocket': Please use the 'new' operator.");
        const args=arguments.length>1?[url,protocols]:[url]; const tgt=new.target; const nt=tgt===g.wrapper?g.downstream:tgt;
        const s=Reflect.construct(g.downstream,args,nt); if(g.captures) observe(s); return s;
      }; shape(g.wrapper,down); return g;
    }
    let current=makeGen(Native,true);
    function adopt(c){ if(typeof c!=='function'||c===current.wrapper) return; current=makeGen(c,c===Native)}
    const getter=()=>current.wrapper, setter=c=>adopt(c);
    function ensure(){
      try{
        const d=Object.getOwnPropertyDescriptor(window,'WebSocket');
        if(d&&d.get===getter&&d.set===setter) return;
        adopt(window.WebSocket);
        Object.defineProperty(window,'WebSocket',{configurable:true,enumerable:d?.enumerable??true,get:getter,set:setter});
      }catch{ try{window.WebSocket=current.wrapper}catch{}}
    }
    ensure(); queueMicrotask(ensure); document.addEventListener('DOMContentLoaded',ensure,{once:true}); window.addEventListener('load',ensure,{once:true}); setInterval(()=>{ensure(); prune()},1500);
  })();
})();
