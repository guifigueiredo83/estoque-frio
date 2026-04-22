const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const admin = require('firebase-admin');

// Inicializa Firebase Admin com credenciais do secret
const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(credentials)
});
const db = admin.firestore();

const INSTANCE = process.env.ULTRAMSG_INSTANCE;
const TOKEN    = process.env.ULTRAMSG_TOKEN;
const NUMERO   = process.env.WHATSAPP_NUMBER;

function dpv(v) {
  const hoje = new Date().toISOString().split('T')[0];
  return Math.floor((new Date(v + 'T00:00:00') - new Date(hoje + 'T00:00:00')) / 86400000);
}

function fmtData(v) {
  const [y,m,d] = v.split('-');
  return `${d}/${m}/${y}`;
}

async function main() {
  const snap = await db.collection('produtos').get();
  const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const vencidos  = prods.filter(p => dpv(p.v) < 0);
  const vencendo  = prods.filter(p => { const d = dpv(p.v); return d >= 0 && d <= 3; });
  const zerados   = prods.filter(p => p.q <= 0);
  const baixo     = prods.filter(p => p.q > 0 && p.q < (p.mn || 1));

  const dataHoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric' });

  let msg = `🧊 *RESUMO DO ESTOQUE — ${dataHoje}*\n`;
  msg += `_Relatório automático gerado às 6h_\n\n`;

  if (vencidos.length === 0 && vencendo.length === 0 && zerados.length === 0 && baixo.length === 0) {
    msg += `✅ *Tudo em ordem!* Nenhum produto com problema.\n\n`;
  }

  if (vencidos.length > 0) {
    msg += `❌ *VENCIDOS (${vencidos.length}):*\n`;
    vencidos.forEach(p => { msg += `  • ${p.n} — venceu em ${fmtData(p.v)}\n`; });
    msg += '\n';
  }

  if (vencendo.length > 0) {
    msg += `⚠️ *VENCEM EM ATÉ 3 DIAS (${vencendo.length}):*\n`;
    vencendo.forEach(p => { msg += `  • ${p.n} — vence em ${fmtData(p.v)} (${dpv(p.v) === 0 ? 'HOJE' : dpv(p.v) + 'd'})\n`; });
    msg += '\n';
  }

  if (zerados.length > 0) {
    msg += `🚨 *ZERADOS (${zerados.length}):*\n`;
    zerados.forEach(p => { msg += `  • ${p.n}\n`; });
    msg += '\n';
  }

  if (baixo.length > 0) {
    msg += `📉 *ABAIXO DO MÍNIMO (${baixo.length}):*\n`;
    baixo.forEach(p => { msg += `  • ${p.n} — ${parseFloat(p.q.toFixed(2))} ${p.u} (mín: ${p.mn || 1})\n`; });
    msg += '\n';
  }

  msg += `📦 *Total em estoque:* ${prods.length} produtos\n`;
  msg += `🔗 _Acesse: https://guifigueiredo83.github.io/estoque-frio/_`;

  // Envia via Ultramsg
  const url = `https://api.ultramsg.com/${INSTANCE}/messages/chat`;
  const body = new URLSearchParams({
    token: TOKEN,
    to: NUMERO,
    body: msg
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const json = await res.json();
  console.log('Resposta Ultramsg:', JSON.stringify(json));

  if (json.sent === 'true' || json.id) {
    console.log('✅ Mensagem enviada com sucesso!');
  } else {
    console.error('❌ Erro ao enviar:', json);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
