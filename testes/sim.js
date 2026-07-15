const N = require('./nucleo.js');
const { recalc, getRelMin } = N;
const { Servidor, Cliente, CFG, pac, BASE } = require('./simlib.js');
const { horariosDuplicados } = N;

let falhas=0, testes=0;
function checar(nome,cond,extra){
  testes++;
  if(cond){ console.log("  ok   "+nome); }
  else { falhas++; console.log("  FALHA "+nome+(extra?"\n         "+extra:"")); }
}
function cena(t){ console.log("\n=== "+t+" ==="); }

// ============ S1: eco não vira loop ============
cena("S1 · eco da própria escrita não re-envia (loop infinito)");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S1",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S1",CFG,[],'substituir');
  A.pushesPac=0; B.pushesPac=0;
  A.editar(1001,{doseReal:"6.2"});
  s.entregar();
  checar("A empurrou exatamente 1 vez",A.pushesPac===1,"pushes="+A.pushesPac);
  checar("B não re-empurrou o eco",B.pushesPac===0,"pushes="+B.pushesPac);
  checar("sem loop detectado",!A.loopDetectado&&!B.loopDetectado);
  checar("B recebeu a dose",B.lista.find(p=>p.id===1001).doseReal==="6.2");
}

// ============ S2: convergência básica ============
cena("S2 · convergência A <-> B");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S2",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S2",CFG,[],'substituir');
  A.adicionar(pac(1005,"Eva",55,"09:55")); s.entregar();
  B.editar(1002,{doseReal:"8.1"}); s.entregar();
  A.remover(1004); s.entregar();
  checar("A e B idênticos",A.digital()===B.digital(),"A="+A.digital()+"\n         B="+B.digital());
  checar("Eva chegou em B",!!B.lista.find(p=>p.id===1005));
  checar("Diego sumiu dos dois",!A.lista.find(p=>p.id===1004)&&!B.lista.find(p=>p.id===1004));
}

// ============ S3: edições concorrentes em pacientes DIFERENTES ============
cena("S3 · dois operadores, pacientes diferentes, ao mesmo tempo");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S3",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S3",CFG,[],'substituir');
  A.editar(1001,{doseReal:"6.0"});   // ninguém entregou ainda
  B.editar(1002,{doseReal:"7.5"});
  s.entregar();
  const a1=A.lista.find(p=>p.id===1001).doseReal, a2=A.lista.find(p=>p.id===1002).doseReal;
  const b1=B.lista.find(p=>p.id===1001).doseReal, b2=B.lista.find(p=>p.id===1002).doseReal;
  checar("as DUAS doses sobrevivem (nada de sobrescrita silenciosa)",
    a1==="6.0"&&a2==="7.5"&&b1==="6.0"&&b2==="7.5",`A=[${a1},${a2}] B=[${b1},${b2}]`);
  checar("convergiram",A.digital()===B.digital());
}

// ============ S4: edição concorrente no MESMO paciente ============
cena("S4 · dois operadores, MESMO paciente (última escrita vence)");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S4",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S4",CFG,[],'substituir');
  A.editar(1001,{doseReal:"6.0"});
  B.editar(1001,{doseReal:"9.9"});
  s.entregar();
  const a=A.lista.find(p=>p.id===1001).doseReal, b=B.lista.find(p=>p.id===1001).doseReal;
  checar("convergiram para o MESMO valor (sem split-brain)",a===b,`A=${a} B=${b}`);
  checar("valor é um dos dois escritos",a==="6.0"||a==="9.9",`valor=${a}`);
}

// ============ S5: hCalib com sala ativa (o ponto suspeito) ============
cena("S5 · mudar hCalib com sala ativa — re-agendamento simultâneo");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S5",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S5",CFG,[],'substituir');
  A.mudarCfg({hCalib:"07:00"});
  const ev=s.entregar();
  checar("não entrou em loop infinito",!A.loopDetectado&&!B.loopDetectado,
    `A.loop=${A.loopDetectado} B.loop=${B.loopDetectado}`);
  checar("A e B convergiram",A.digital()===B.digital(),
    "\n         A="+A.digital()+"\n         B="+B.digital());
  checar("hCalib igual nos dois",A.cfg.hCalib===B.cfg.hCalib,`A=${A.cfg.hCalib} B=${B.cfg.hCalib}`);
  const horas=A.ordenada().map(p=>p.hSim);
  checar("horários re-agendados a partir de 07:15",horas[0]==="07:15",horas.join(","));
  checar("gap de 25min mantido",horas.join(",")==="07:15,07:40,08:05,08:30",horas.join(","));
  console.log("         eventos realtime trocados: "+ev);
}

// ============ S5b: hCalib com paciente JÁ DOSADO ============
cena("S5b · mudar hCalib com paciente já dosado (âncora)");
{
  const s=new Servidor();
  const lista=[pac(2001,"Ana",70,"08:15","6.5"),pac(2002,"Bruno",85,"08:40"),pac(2003,"Carla",60,"09:05")];
  const A=new Cliente("A",s,"S5b",CFG,lista,'enviar');
  const B=new Cliente("B",s,"S5b",CFG,[],'substituir');
  A.mudarCfg({hCalib:"07:00"});
  s.entregar();
  const ana=A.lista.find(p=>p.id===2001);
  checar("dosado manteve horário",ana.hSim==="08:15",ana.hSim);
  checar("dosado manteve doseReal",ana.doseReal==="6.5",ana.doseReal);
  checar("convergiram",A.digital()===B.digital());
  checar("sem loop",!A.loopDetectado&&!B.loopDetectado);
}

// ============ S6: reordenar sob sync ============
cena("S6 · arrastar para reordenar com sala ativa");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S6",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S6",CFG,[],'substituir');
  const ids=A.ordenada().map(p=>p.id);           // [1001,1002,1003,1004]
  const nova=[ids[3],ids[0],ids[1],ids[2]];      // Diego para o começo
  A.reordenar(nova);
  s.entregar();
  const ordemA=A.ordenada().map(p=>p.nome);
  checar("Diego assumiu o 1º horário",ordemA[0]==="Diego",ordemA.join(","));
  checar("A e B convergiram",A.digital()===B.digital(),
    "\n         A="+A.digital()+"\n         B="+B.digital());
  checar("horários preservados como conjunto",
    A.ordenada().map(p=>p.hSim).join(",")==="08:15,08:40,09:05,09:30",
    A.ordenada().map(p=>p.hSim).join(","));
}

// ============ S7: dois reordenando ao mesmo tempo ============
cena("S7 · dois operadores reordenando simultaneamente (limitação conhecida)");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S7",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S7",CFG,[],'substituir');
  const ids=A.ordenada().map(p=>p.id);
  A.reordenar([ids[3],ids[0],ids[1],ids[2]]);
  B.reordenar([ids[1],ids[0],ids[2],ids[3]]);
  s.entregar();
  const conv=A.digital()===B.digital();
  checar("mesmo em conflito, os dois convergem (não divergem)",conv,
    "\n         A="+A.ordenada().map(p=>p.nome+"@"+p.hSim).join(" ")+
    "\n         B="+B.ordenada().map(p=>p.nome+"@"+p.hSim).join(" "));
  const horas=A.ordenada().map(p=>p.hSim);
  const dup=horariosDuplicados(A.lista);
  checar("horário duplicado é DETECTADO pelo app",
    Object.keys(dup).length>0 ? true : new Set(horas).size===horas.length,
    "duplicados="+JSON.stringify(Object.keys(dup))+" horas="+horas.join(","));
  console.log("         ordem final: "+A.ordenada().map(p=>p.nome).join(" -> "));
}

// ============ S8: offline + reconexão (dose registrada sem rede) ============
cena("S8 · B registra dose offline e reconecta");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S8",CFG,BASE,'enviar');
  const B=new Cliente("B",s,"S8",CFG,[],'substituir');
  B.cair();
  B.editar(1003,{doseReal:"5.5"});      // dose dada com rede caída
  A.editar(1001,{doseReal:"6.6"});      // colega trabalhou normal
  s.entregar();
  B.voltar();
  s.entregar();
  const b3=B.lista.find(p=>p.id===1003), a3=A.lista.find(p=>p.id===1003);
  checar("dose registrada offline sobreviveu em B",b3.doseReal==="5.5",b3.doseReal);
  checar("dose offline chegou em A",a3&&a3.doseReal==="5.5",a3?a3.doseReal:"—");
  checar("trabalho do colega não foi perdido",B.lista.find(p=>p.id===1001).doseReal==="6.6");
  checar("convergiram",A.digital()===B.digital(),
    "\n         A="+A.digital()+"\n         B="+B.digital());
}

// ============ S9: entrar na sala substitui o local ============
cena("S9 · entrar numa sala substitui a operação local");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S9",CFG,BASE,'enviar');
  const locaisB=[pac(9001,"Fantasma",50,"10:00")];
  const B=new Cliente("B",s,"S9",CFG,locaisB,'substituir');
  s.entregar();
  checar("lista local de B foi substituída",!B.lista.find(p=>p.id===9001));
  checar("B recebeu a fila da sala",B.lista.length===4);
  checar("Fantasma NÃO vazou para A",!A.lista.find(p=>p.id===9001));
}

// ============ S10: guilhotina sob sync ============
cena("S10 · guilhotina propaga igual nos dois");
{
  const s=new Servidor();
  const cfgP={...CFG,aCalib:"22"};          // frasco curto de propósito
  const A=new Cliente("A",s,"S10",cfgP,BASE,'enviar');
  const B=new Cliente("B",s,"S10",cfgP,[],'substituir');
  A.editar(1001,{doseReal:"12.0"});          // consome muito
  s.entregar();
  const calc=c=>recalc(c.lista,c.cfg.aCalib,c.cfg.vCalib,c.cfg.hCalib,109.77,4,0.08,0.12);
  const rA=calc(A), rB=calc(B);
  const gA=rA.lista.filter(p=>p.guilhotina).map(p=>p.nome).sort();
  const gB=rB.lista.filter(p=>p.guilhotina).map(p=>p.nome).sort();
  checar("mesma lista de guilhotinados nos dois",JSON.stringify(gA)===JSON.stringify(gB),
    `A=[${gA}] B=[${gB}]`);
  checar("atividade final idêntica",Math.abs(rA.atvFinal-rB.atvFinal)<1e-9,
    `A=${rA.atvFinal} B=${rB.atvFinal}`);
  console.log("         guilhotinados: "+(gA.length?gA.join(", "):"nenhum"));
}

// ============ S11: "a dose muda sob o operador" — quantificar ============
cena("S11 · quanto a dose do pendente muda quando o colega registra dose");
{
  const s=new Servidor();
  const cfgAp={...CFG,aCalib:"45"};
  const A=new Cliente("A",s,"S11",cfgAp,BASE,'enviar');
  const B=new Cliente("B",s,"S11",cfgAp,[],'substituir');
  const calc=c=>recalc(c.lista,c.cfg.aCalib,c.cfg.vCalib,c.cfg.hCalib,109.77,4,0.08,0.12);
  const antes=calc(A).lista.find(p=>p.id===1004).doseAplicar;
  B.editar(1001,{doseReal:"8.4"});           // colega puxa a dose maxima da Ana
  s.entregar();
  const depois=calc(A).lista.find(p=>p.id===1004).doseAplicar;
  const delta=depois-antes;
  console.log(`         Diego antes: ${antes.toFixed(2)} mCi -> depois: ${depois.toFixed(2)} mCi  (${delta>=0?'+':''}${delta.toFixed(2)})`);
  checar("a dose realmente muda sob o operador (risco confirmado, não corrigido)",Math.abs(delta)>0.01,
    "delta="+delta.toFixed(3));
}

// ============ S12: entrar na sala nao pode reescrever horarios ============
cena("S12 · entrar numa sala não pode reescrever os horários da fila");
{
  const s=new Servidor();
  const A=new Cliente("A",s,"S12",CFG,BASE,'enviar');
  const antes=A.ordenada().map(p=>p.nome+"@"+p.hSim).join(" ");
  const cfgB={...CFG,hCalib:"10:30"};      // aparelho do colega com calibração velha
  const B=new Cliente("B",s,"S12",cfgB,[],'substituir');
  s.entregar();
  const depoisA=A.ordenada().map(p=>p.nome+"@"+p.hSim).join(" ");
  const depoisB=B.ordenada().map(p=>p.nome+"@"+p.hSim).join(" ");
  checar("horários da sala intactos após B entrar",antes===depoisA,
    "\n         antes  = "+antes+"\n         depois = "+depoisA);
  checar("A e B convergiram",depoisA===depoisB,
    "\n         A="+depoisA+"\n         B="+depoisB);
}

// ============ S13: reload nao pode apagar a calibracao do colega ============
cena("S13 · reload de B não pode apagar a calibração do frasco");
{
  const s=new Servidor();
  const semCalib={...CFG,aCalib:"",vCalib:""};
  const A=new Cliente("A",s,"S13",semCalib,BASE,'enviar');
  const B=new Cliente("B",s,"S13",semCalib,[],'substituir');
  A.mudarCfg({aCalib:"95.8",vCalib:"5.0"});   // A calibra o frasco
  s.entregar();
  checar("B recebeu a calibração",B.cfg.aCalib==="95.8",B.cfg.aCalib);
  B.cair();
  A.mudarCfg({aCalib:"88.2"});                 // A corrige a calibração
  s.entregar();
  B.voltar();                                   // B recarrega a pagina
  s.entregar();
  checar("calibração de A sobreviveu ao reload de B",A.cfg.aCalib==="88.2",A.cfg.aCalib);
  checar("B adotou a calibração da sala",B.cfg.aCalib==="88.2",B.cfg.aCalib);
}

// ---------------- resumo ----------------
console.log("\n"+"=".repeat(60));
console.log(`RESULTADO: ${testes-falhas}/${testes} passaram${falhas?`  ·  ${falhas} FALHA(S)`:"  ·  tudo ok"}`);
console.log("=".repeat(60));
process.exitCode = falhas?1:0;
