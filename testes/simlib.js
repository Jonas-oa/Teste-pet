const N = require('./nucleo.js');
const { getRelMin, addMin, recalc, reordenarFilaPorPosicao,
        pacParaLinha, linhaParaPac, instantePac, difPac, COL_PAC, mesclarNaCarga, horariosDuplicados } = N;

// ---------------- servidor falso (Postgres + realtime) ----------------
class Servidor {
  constructor(){ this.operacao={}; this.pacientes={}; this.subs=[]; this.fila=[]; this.ops=0; }
  _chave(sala,id){ return sala+'|'+id; }
  upsertOperacao(row){
    this.ops++;
    this.operacao[row.sala_id]={...(this.operacao[row.sala_id]||{sala_id:row.sala_id,cfg:{}}),...row};
    this._emitir({table:'operacao',eventType:'UPDATE',new:{...this.operacao[row.sala_id]}});
  }
  upsertPacientes(rows){
    this.ops++;
    for(const r of rows){
      this.pacientes[this._chave(r.sala_id,r.id)]={...r};
      this._emitir({table:'pacientes',eventType:'UPDATE',new:{...r}});
    }
  }
  deletePacientes(sala,ids){
    this.ops++;
    for(const id of ids){
      const k=this._chave(sala,id);
      if(this.pacientes[k]){ delete this.pacientes[k];
        this._emitir({table:'pacientes',eventType:'DELETE',old:{id:String(id),sala_id:sala}}); }
    }
  }
  updatePaciente(sala,id,campos){
    this.ops++;
    const k=this._chave(sala,id);
    if(!this.pacientes[k]) return;
    this.pacientes[k]={...this.pacientes[k],...campos};
    this._emitir({table:'pacientes',eventType:'UPDATE',new:{...this.pacientes[k]}});
  }
  selectOperacao(sala){ return this.operacao[sala]||null; }
  selectPacientes(sala){ return Object.values(this.pacientes).filter(r=>r.sala_id===sala).map(r=>({...r})); }
  _emitir(ev){ this.fila.push(ev); }
  // entrega os eventos pendentes a todos menos a origem declarada
  entregar(){
    let n=0, guarda=0;
    while(this.fila.length && guarda++<500){
      const lote=this.fila; this.fila=[];
      for(const ev of lote){ for(const s of this.subs){ s(ev); n++; } }
    }
    return n;
  }
}

// ---------------- cliente (espelha useSalaSync + efeito de re-agendamento) ----------------
let SEQ=0;
class Cliente {
  constructor(nome,srv,sala,cfg,lista,modo='enviar'){
    this.nome=nome; this.srv=srv; this.sala=sala;
    this.cfg=JSON.parse(JSON.stringify(cfg));
    this.lista=JSON.parse(JSON.stringify(lista));
    this.online=true;
    this.ecoPac={}; this.ecoCfg=null; this.pronto=false;
    this.pushesPac=0; this.pushesCfg=0; this.loopDetectado=false;
    // refs do efeito de re-agendamento do App
    this.prevH=this.cfg.hCalib; this.prevI=this.cfg.intervalo;
    this.prevFMin=this.cfg.fMin; this.prevFMax=this.cfg.fMax;
    this.srv.subs.push(ev=>this._realtime(ev));
    this._cargaInicial(modo);
  }
  _cargaInicial(modo){
    if(!this.online) return;
    if(!this.srv.selectOperacao(this.sala)) this.srv.upsertOperacao({sala_id:this.sala,cfg:{}});
    const op=this.srv.selectOperacao(this.sala);
    const remotos=this.srv.selectPacientes(this.sala).map(linhaParaPac);
    let final=remotos, enviar=[];
    if(modo==='enviar'){
      const m=mesclarNaCarga(this.lista,remotos);
      final=m.mesclada; enviar=m.paraEnviar; this.conflitos=m.conflitos;
    }
    this.ecoPac={}; final.forEach(p=>{this.ecoPac[p.id]=instantePac(p);});
    if(enviar.length) this.srv.upsertPacientes(enviar.map(p=>pacParaLinha(this.sala,p)));
    if(op&&op.cfg&&Object.keys(op.cfg).length){
      this.ecoCfg=JSON.stringify(op.cfg);
      this.cfg={...this.cfg,...op.cfg};
    }else if(modo==='enviar'){
      this.ecoCfg=JSON.stringify(this.cfg);
      this.srv.upsertOperacao({sala_id:this.sala,cfg:this.cfg});
    }
    this.lista=final;
    this.pronto=true;
    this.efeitos();   // efeitos rodam apos a carga, como no React
  }
  _sincronizarRefs(){
    this.prevH=this.cfg.hCalib; this.prevI=this.cfg.intervalo;
    this.prevFMin=this.cfg.fMin; this.prevFMax=this.cfg.fMax;
  }
  _realtime(ev){
    if(!this.online||!this.pronto) return;
    if(ev.table==='pacientes'){
      if(ev.eventType==='DELETE'){
        const id=Number(ev.old.id); if(!id) return;
        if(ev.old.sala_id!==this.sala) return;
        delete this.ecoPac[id];
        this.lista=this.lista.filter(x=>x.id!==id);
      }else{
        if(ev.new.sala_id!==this.sala) return;
        const p=linhaParaPac(ev.new);
        this.ecoPac[p.id]=instantePac(p);
        const i=this.lista.findIndex(x=>x.id===p.id);
        if(i<0) this.lista=[...this.lista,p];
        else { const n=[...this.lista]; n[i]={...n[i],...p}; this.lista=n; }
      }
    }else if(ev.table==='operacao'){
      if(ev.new.sala_id!==this.sala) return;
      const c=ev.new.cfg; if(!c||!Object.keys(c).length) return;
      const s=JSON.stringify(c);
      if(s===this.ecoCfg) return;
      this.ecoCfg=s;
      this.cfg={...this.cfg,...c};
    }
    this.efeitos();
  }
  // --- efeito do App: re-agendamento automático ao mudar hCalib/intervalo/fMin/fMax
  _efeitoReagendar(){
    const cfg=this.cfg;
    const hMud=cfg.hCalib&&this.prevH!==cfg.hCalib;
    const iMud=cfg.intervalo&&this.prevI!==cfg.intervalo;
    const fMinMud=cfg.fMin!==this.prevFMin;
    const fMaxMud=cfg.fMax!==this.prevFMax;
    if(!(hMud||iMud||fMinMud||fMaxMud)) return false;
    let nova=[...this.lista], modificou=false;
    if((hMud||iMud)&&nova.length>0){
      nova.sort((a,b)=>getRelMin(a.hSim,this.prevH||cfg.hCalib)-getRelMin(b.hSim,this.prevH||cfg.hCalib));
      let cur=addMin(cfg.hCalib,15);
      const gap=Number(cfg.intervalo)||25;
      nova=nova.map(p=>{
        if(!isNaN(parseFloat(p.doseReal))&&parseFloat(p.doseReal)>0){ cur=addMin(p.hSim,gap); return p; }
        const novo=cur; cur=addMin(cur,gap);
        if(p.hSim!==novo){ modificou=true; return {...p,hSim:novo}; }
        return p;
      });
    }
    if(fMinMud||fMaxMud){
      nova=nova.map(p=>{
        if(p.fMin!==cfg.fMin||p.fMax!==cfg.fMax){ modificou=true; return {...p,fMin:cfg.fMin,fMax:cfg.fMax}; }
        return p;
      });
    }
    if(modificou) this.lista=nova;
    this.prevH=cfg.hCalib; this.prevI=cfg.intervalo;
    this.prevFMin=cfg.fMin; this.prevFMax=cfg.fMax;
    return modificou;
  }
  // --- efeito: envia pacientes alterados
  _efeitoPushPac(){
    if(!this.sala||!this.pronto||!this.online) return false;
    const vistos={}, novos=[], patches=[];
    for(const p of this.lista){
      vistos[p.id]=1;
      const ant=this.ecoPac[p.id];
      if(!ant){ this.ecoPac[p.id]=instantePac(p); novos.push(p); continue; }
      const d=difPac(ant,p);
      if(Object.keys(d).length){ this.ecoPac[p.id]=instantePac(p); patches.push({id:p.id,campos:d}); }
    }
    const removidos=Object.keys(this.ecoPac).filter(id=>!vistos[id]);
    removidos.forEach(id=>{ delete this.ecoPac[id]; });
    if(!novos.length&&!patches.length&&!removidos.length) return false;
    if(novos.length){ this.srv.upsertPacientes(novos.map(p=>pacParaLinha(this.sala,p))); this.pushesPac++; }
    for(const pt of patches){
      const set={};
      Object.keys(pt.campos).forEach(k=>{ set[COL_PAC[k]]=pt.campos[k]; });
      this.srv.updatePaciente(this.sala,String(pt.id),set); this.pushesPac++;
    }
    if(removidos.length){ this.srv.deletePacientes(this.sala,removidos); this.pushesPac++; }
    return true;
  }
  // --- efeito: envia cfg
  _efeitoPushCfg(){
    if(!this.sala||!this.pronto||!this.online) return false;
    const s=JSON.stringify(this.cfg);
    if(s===this.ecoCfg) return false;
    this.ecoCfg=s;
    this.srv.upsertOperacao({sala_id:this.sala,cfg:JSON.parse(s)});
    this.pushesCfg++;
    return true;
  }
  efeitos(){
    let n=0;
    while(n++<60){
      const a=this._efeitoReagendar();
      const b=this._efeitoPushPac();
      const c=this._efeitoPushCfg();
      if(!a&&!b&&!c) return;
    }
    this.loopDetectado=true;
  }
  // ---- ações do usuário
  editar(id,upd){ this.lista=this.lista.map(p=>p.id===id?{...p,...upd}:p); this.efeitos(); }
  adicionar(p){ this.lista=[...this.lista,p]; this.efeitos(); }
  remover(id){ this.lista=this.lista.filter(p=>p.id!==id); this.efeitos(); }
  mudarCfg(upd){ this.cfg={...this.cfg,...upd}; this.efeitos(); }
  reordenar(ids){ this.lista=reordenarFilaPorPosicao(this.lista,this.cfg.hCalib,ids); this.efeitos(); }
  ordenada(){ return [...this.lista].sort((a,b)=>getRelMin(a.hSim,this.cfg.hCalib)-getRelMin(b.hSim,this.cfg.hCalib)); }
  canonico(){ return JSON.stringify([...this.lista].sort((a,b)=>a.id-b.id).map(p=>[p.id,p.nome,p.peso,p.hSim,p.fMin,p.fMax,p.doseReal])); }
  digital(){ return JSON.stringify(this.ordenada().map(p=>[p.id,p.nome,p.peso,p.hSim,p.fMin,p.fMax,p.doseReal])); }
  cair(){ this.online=false; }
  voltar(){ this.online=true; this.pronto=false; this._cargaInicial('enviar'); }
}

// ---------------- utilidades de teste ----------------
const CFG={farmaco:"Flúor-18 (¹⁸F)",mvCustom:"109.77",perda:"4",hCalib:"08:00",aCalib:"95.8",vCalib:"5.0",
           lote:"L1",uptake:60,intervalo:25,instituicao:"",fMin:"0.08",fMax:"0.12"};
const pac=(id,nome,peso,h,dr="")=>({id,nome,peso:String(peso),hSim:h,fMin:"0.08",fMax:"0.12",doseReal:dr});
const BASE=[pac(1001,"Ana",70,"08:15"),pac(1002,"Bruno",85,"08:40"),pac(1003,"Carla",60,"09:05"),pac(1004,"Diego",95,"09:30")];


module.exports={Servidor,Cliente,CFG,pac,BASE};
