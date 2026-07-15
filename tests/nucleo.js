const toMin=t=>{if(!t||!t.includes(':'))return 0;const[h,m]=t.split(":").map(Number);return(h||0)*60+(m||0);};

function stableStringify(value){
  if(value===null||typeof value!=="object") return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

const minsToTime=m=>{let v=m;if(v<0)v+=1440;return`${String(Math.floor(v/60)%24).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;};

const addMin=(t,d)=>minsToTime(toMin(t)+d);

const decair=(a,t12,dt)=>a*Math.pow(2,-dt/t12);

const getRelMin=(time,ref)=>{
  let mTime=typeof time==='string'?toMin(time):time;
  let mRef=typeof ref==='string'?toMin(ref):ref;
  let m=mTime-mRef;
  // Só envolve na virada de meia-noite (valor fortemente negativo).
  // Eventos posteriores à referência em até 23h permanecem positivos,
  // evitando o wrap incorreto em plantões longos (>12h).
  if(m<-180)m+=1440;
  return m;
};
function recalc(lista, ac, vc, hC, t12, perda, fMinG, fMaxG) {
  let cA = parseFloat(ac) || 0;
  let calcList = [...lista].sort((a, b) => getRelMin(a.hSim, hC) - getRelMin(b.hSim, hC));
  let fatorPerda = 1 - perda / 100;

  let lc = calcList.map(p => {
    const w = parseFloat(p.peso) || 0;
    const fmn = parseFloat(p.fMin) || fMinG;
    const fmx = parseFloat(p.fMax) || fMaxG;
    const dPmin = w * fmn, dPmax = w * fmx;
    let dt = Math.max(getRelMin(p.hSim, hC), 0);
    let dec = Math.pow(0.5, dt / t12);
    return { ...p, dPmin, dPmax, dt, dec, doseAplicar: 0, guilhotina: false, doseRealExistente: 0 };
  });

  let pool = cA;
  let pendentes = [];
  
  for (let p of lc) {
    if (!isNaN(parseFloat(p.doseReal)) && parseFloat(p.doseReal) > 0) {
      pool -= (parseFloat(p.doseReal) / fatorPerda) / p.dec;
      p.doseAplicar = parseFloat(p.doseReal);
    } else {
      pendentes.push(p);
    }
  }

  let sobreviventes = [];
  let tempPool = pool;
  
  for (let p of pendentes) {
    let reqMinPool = (p.dPmin / fatorPerda) / p.dec;
    // Paciente sem dose mínima válida (peso vazio/zero) não pode ser
    // tratado como atendível por padrão: exige dPmin > 0.
    if (p.dPmin > 0 && tempPool >= reqMinPool) {
      sobreviventes.push(p);
      tempPool -= reqMinPool; 
    } else {
      p.guilhotina = true;
      p.doseRealExistente = (Math.max(tempPool, 0) * p.dec) * fatorPerda;
      tempPool = 0; 
    }
  }

  let reqMinTotal = sobreviventes.reduce((s, p) => s + (p.dPmin / fatorPerda) / p.dec, 0);
  let surplusPool = pool - reqMinTotal; 

  let reqExtraMaxTotal = 0;
  for (let p of sobreviventes) {
    let extraMax = Math.max(p.dPmax - p.dPmin, 0);
    p.extraReqFull = (extraMax / fatorPerda) / p.dec;
    reqExtraMaxTotal += p.extraReqFull;
  }

  let P = reqExtraMaxTotal > 0 ? Math.min(1, surplusPool / reqExtraMaxTotal) : 0;
  for (let p of sobreviventes) {
    let extraMax = Math.max(p.dPmax - p.dPmin, 0);
    p.doseAplicar = p.dPmin + (P * extraMax);
  }

  let atvCorrente = cA;
  let tA = hC;
  for (let p of lc) {
    let dtPasso = Math.max(getRelMin(p.hSim, tA), 0);
    atvCorrente = decair(atvCorrente, t12, dtPasso);
    p.disp = atvCorrente;
    
    if (p.guilhotina) {
      p.doseAplicar = 0;
    } else {
      let usoFrasco = p.doseAplicar / fatorPerda;
      atvCorrente = atvCorrente - usoFrasco;
      p.isConstrained = (p.doseAplicar < p.dPmax - 0.05 && p.doseAplicar > 0);
    }
    tA = p.hSim;
  }

  const atvFinal = atvCorrente; 
  return { lista: lc, atvFinal };
}

function reordenarFilaPorPosicao(prev,hCalib,idsOrdenados){
  const sorted=[...prev].sort((a,b)=>getRelMin(a.hSim,hCalib)-getRelMin(b.hSim,hCalib));
  const slots=sorted.map(p=>p.hSim);
  const isAdm=p=>!isNaN(parseFloat(p.doseReal))&&parseFloat(p.doseReal)>0;
  const admTimes={};
  sorted.filter(isAdm).forEach(p=>{admTimes[p.hSim]=true;});
  const freeSlots=slots.filter(t=>!admTimes[t]);
  const byId={};
  prev.forEach(p=>{byId[p.id]=p;});
  const pend=idsOrdenados.filter(id=>byId[id]&&!isAdm(byId[id]));
  const nt={};
  pend.forEach((id,i)=>{ nt[id]=freeSlots[i]; });
  return prev.map(p=>{
    if(isAdm(p)) return p;
    const h=nt[p.id];
    return (h&&h!==p.hSim)?{...p,hSim:h,doseReal:""}:p;
  });
}

const CAMPOS_PAC=["nome","peso","hSim","fMin","fMax","doseReal"];

const COL_PAC={nome:"nome",peso:"peso",hSim:"h_sim",fMin:"f_min",fMax:"f_max",doseReal:"dose_real"};

const valPac=(p,k)=>String((p&&p[k])??"");

const pacParaLinha=(sala,p)=>{const r={id:String(p.id),sala_id:sala};CAMPOS_PAC.forEach(k=>{r[COL_PAC[k]]=valPac(p,k);});return r;};

const linhaParaPac=r=>({id:Number(r.id),nome:r.nome||"",peso:r.peso||"",hSim:r.h_sim||"",fMin:r.f_min||"",fMax:r.f_max||"",doseReal:r.dose_real||""});

const instantePac=p=>{const o={};CAMPOS_PAC.forEach(k=>{o[k]=valPac(p,k);});return o;};

const difPac=(ant,atual)=>{const d={};CAMPOS_PAC.forEach(k=>{const v=valPac(atual,k);if(!ant||ant[k]!==v)d[k]=v;});return d;};

const temDose=p=>{const d=parseFloat(p&&p.doseReal);return !isNaN(d)&&d>0;};

function mesclarNaCarga(locais,remotos){
  const porId={},conflitos=[],paraEnviar=[];
  (remotos||[]).forEach(r=>{porId[r.id]={...r};});
  (locais||[]).forEach(l=>{
    const r=porId[l.id];
    if(!r){porId[l.id]={...l};paraEnviar.push(l);return;}
    if(temDose(l)&&!temDose(r)){porId[l.id]={...l};paraEnviar.push(l);return;}
    if(temDose(l)&&temDose(r)&&String(l.doseReal)!==String(r.doseReal))
      conflitos.push({id:l.id,nome:l.nome||r.nome,local:l.doseReal,remoto:r.doseReal});
  });
  return {mesclada:Object.values(porId),paraEnviar,conflitos};
}

const horariosDuplicados=lista=>{
  const c={},d={};
  (lista||[]).forEach(p=>{if(p.hSim)c[p.hSim]=(c[p.hSim]||0)+1;});
  Object.keys(c).forEach(h=>{if(c[h]>1)d[h]=true;});
  return d;
};

module.exports={stableStringify,toMin,minsToTime,addMin,decair,getRelMin,recalc,reordenarFilaPorPosicao,CAMPOS_PAC,COL_PAC,valPac,pacParaLinha,linhaParaPac,instantePac,difPac,temDose,mesclarNaCarga,horariosDuplicados};
