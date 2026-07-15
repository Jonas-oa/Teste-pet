/* Fuzz do protocolo de sala: operações aleatórias em 2-3 aparelhos.
   Invariantes que NÃO podem quebrar:
     I1. todos os aparelhos convergem para o mesmo estado
     I2. nenhum registro de dose administrada some sem alguém tê-lo apagado
     I3. nenhum loop de re-envio infinito
     I4. horário duplicado, se ocorrer, é sempre detectável pelo app       */
const { Servidor, Cliente, CFG, pac } = require('./simlib.js');
const N = require('./nucleo.js');

let seed = 8675309;
let _id = 100000;
const proxId = () => ++_id;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = n => Math.floor(rnd() * n);
const pick = a => a[ri(a.length)];

function cenario(k){
  const nPac = 2 + ri(6);
  const base = [];
  let h = 8*60 + 15;
  for(let i=0;i<nPac;i++){
    base.push(pac(9000+i, "P"+i, 50+ri(60), N.minsToTime(h)));
    h += 20 + ri(20);
  }
  const cfg = {...CFG, aCalib: String(20+ri(90)), intervalo: 15+ri(20)};
  const s = new Servidor();
  const A = new Cliente("A",s,"F"+k,cfg,base,'enviar');
  const cls = [A];
  const nCli = 2 + ri(2);
  for(let i=1;i<nCli;i++) cls.push(new Cliente(String.fromCharCode(66+i-1),s,"F"+k,cfg,[],'substituir'));
  s.entregar();

  const dosesRegistradas = {};   // id -> valor, para checar I2
  const nOps = 4 + ri(10);
  for(let o=0;o<nOps;o++){
    const c = pick(cls);
    const alvo = c.lista.length ? pick(c.lista) : null;
    const acao = ri(7);
    try{
      if(acao===0 && alvo){ const v=(1+rnd()*12).toFixed(1); c.editar(alvo.id,{doseReal:v}); dosesRegistradas[alvo.id]=v; }
      else if(acao===1 && alvo){ c.editar(alvo.id,{peso:String(40+ri(70)),doseReal:""}); delete dosesRegistradas[alvo.id]; }
      else if(acao===2){ const id=proxId(); c.adicionar(pac(id,"N"+id,60+ri(40),N.minsToTime(8*60+ri(200)))); }
      else if(acao===3 && alvo && c.lista.length>1){ c.remover(alvo.id); delete dosesRegistradas[alvo.id]; }
      else if(acao===4){ c.mudarCfg({hCalib:N.minsToTime(6*60+ri(180))}); }
      else if(acao===5 && c.lista.length>1){
        const ids=c.ordenada().map(p=>p.id);
        const j=ri(ids.length), t=ri(ids.length);
        const mv=ids.splice(j,1)[0]; ids.splice(t,0,mv);
        c.reordenar(ids);
      }
      else if(acao===6){ c.cair(); s.entregar(); c.voltar(); }
      if(ri(3)) s.entregar();
    }catch(e){ return {ok:false,motivo:"exceção: "+e.message}; }
  }
  // deixa a rede assentar
  for(let i=0;i<5;i++){ cls.forEach(c=>{ if(!c.online) c.voltar(); }); s.entregar(); }

  // I3
  const loop = cls.find(c=>c.loopDetectado);
  if(loop) return {ok:false,motivo:"loop de re-envio em "+loop.nome};
  // I1
  const digs = cls.map(c=>c.canonico());
  if(new Set(digs).size!==1) return {ok:false,motivo:"divergiram:\n  "+digs.join("\n  ")};
  // I2
  for(const id of Object.keys(dosesRegistradas)){
    const p = cls[0].lista.find(x=>x.id===Number(id));
    if(p && !N.temDose(p)) return {ok:false,motivo:`dose registrada do paciente ${id} sumiu (era ${dosesRegistradas[id]})`};
  }
  // I4
  const dup = N.horariosDuplicados(cls[0].lista);
  const horas = cls[0].lista.map(p=>p.hSim);
  const temDupReal = new Set(horas).size !== horas.length;
  if(temDupReal && !Object.keys(dup).length) return {ok:false,motivo:"duplicado existe mas não é detectado"};
  return {ok:true, dup:Object.keys(dup).length>0};
}

const TOTAL = parseInt(process.argv[2]||"5000",10);
let falhas=0, comDup=0;
const exemplos=[];
for(let k=0;k<TOTAL;k++){
  const r = cenario(k);
  if(!r.ok){ falhas++; if(exemplos.length<3) exemplos.push(`cenário #${k}: ${r.motivo}`); }
  else if(r.dup) comDup++;
}
console.log(`cenários...........: ${TOTAL}`);
console.log(`falhas de invariante: ${falhas}`);
console.log(`com horário duplicado (detectado e avisado): ${comDup} (${(comDup/TOTAL*100).toFixed(1)}%)`);
if(exemplos.length){ console.log("\nexemplos:"); exemplos.forEach(e=>console.log("  "+e)); }
console.log(falhas? "\n>> FALHOU" : "\n>> todos os invariantes se mantiveram");
process.exitCode = falhas?1:0;
