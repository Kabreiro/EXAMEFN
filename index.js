const express = require('express');
const session = require('express-session');
const cookies = require('cookie-parser');
const fs = require('fs').promises;
const path = require('path');

const servidor = express();

servidor.use(express.json());
servidor.use(express.urlencoded({ extended: true }));

servidor.use(cookies());
servidor.use(session({
  secret: 'chave_secreta_segura_456',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1800000 }
}));

const caminhoDados = path.join(__dirname, 'data');

async function carregarJSON(arquivo) {
  try {
    const conteudo = await fs.readFile(path.join(caminhoDados, arquivo), 'utf-8');
    return JSON.parse(conteudo);
  } catch {
    return [];
  }
}

async function gravarJSON(arquivo, conteudo) {
  await fs.writeFile(path.join(caminhoDados, arquivo), JSON.stringify(conteudo, null, 2));
}

const credenciais = { usuario: 'admin', senha: '1234' };

function verificarLogin(req, res, next) {
  if (req.session?.usuario) return next();
  res.redirect('/login.html');
}

servidor.use(express.static(path.join(__dirname, 'paginas')));

servidor.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === credenciais.usuario && senha === credenciais.senha) {
    req.session.usuario = usuario;
    res.cookie('ultimoAcesso', new Date().toISOString(), { maxAge: 1800000 });
    res.redirect('/menu.html');
  } else {
    res.send('<h1>Credenciais inválidas</h1><a href="/login.html">Tentar novamente</a>');
  }
});

servidor.get('/logout', verificarLogin, (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

servidor.get('/cadastroUsuarios', verificarLogin, async (req, res) => {
  const usuarios = await carregarJSON('usuarios.json');
  const linhas = usuarios.map(u => `
    <tr>
      <td>${u.nome}</td>
      <td>${u.email}</td>
      <td>${u.nickname}</td>
      <td>${u.dataNascimento}</td>
      <td>${u.assunto}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Cadastro</title></head><body>
  <h1>Cadastro</h1>
  <form method="POST" action="/cadastroUsuarios">
    <label>Nome: <input type="text" name="nome" required></label><br>
    <label>Email: <input type="email" name="email" required></label><br>
    <label>Senha: <input type="password" name="senha" required></label><br>
    <label>Nickname: <input type="text" name="nickname" required></label><br>
    <label>Data de Nascimento: <input type="date" name="dataNascimento" required></label><br>
    <label>Assunto: 
      <select name="assunto" required>
        <option value="">Selecione</option>
        <option>Futebol</option>
        <option>Games</option>
        <option>Carros</option>
        <option>Música</option>
      </select>
    </label><br>
    <button type="submit">Enviar</button>
  </form>
  <h2>Lista de usuários</h2>
  <table border="1"><thead><tr>
    <th>Nome</th><th>Email</th><th>Nickname</th><th>Nascimento</th><th>Assunto</th>
  </tr></thead><tbody>${linhas}</tbody></table>
  <a href="/menu.html">Menu</a>
</body></html>`);
});

servidor.post('/cadastroUsuarios', verificarLogin, async (req, res) => {
  const { nome, email, senha, nickname, dataNascimento, assunto } = req.body;
  if (![nome, email, senha, nickname, dataNascimento, assunto].every(Boolean)) {
    return res.send('<h1>Preencha todos os campos</h1><a href="/cadastroUsuarios">Voltar</a>');
  }

  const usuarios = await carregarJSON('usuarios.json');
  if (usuarios.some(u => u.email === email || u.nickname === nickname)) {
    return res.send('<h1>Email ou Nickname já usado</h1><a href="/cadastroUsuarios">Voltar</a>');
  }

  usuarios.push({ nome, email, senha, nickname, dataNascimento, assunto });
  await gravarJSON('usuarios.json', usuarios);
  res.redirect('/cadastroUsuarios');
});

function montarTelaBatePapo(nick, tema, mensagens) {
  const mensagensFiltradas = mensagens.filter(m => m.assunto.toLowerCase() === tema.toLowerCase());
  const mensagensHtml = mensagensFiltradas.map(m =>
    `<p><strong>${m.usuario}</strong> [${new Date(m.dataHora).toLocaleString()}]: ${m.mensagem}</p>`
  ).join('') || '<p>Sem mensagens ainda.</p>';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${tema}</title></head><body>
    <h1>Bate-papo - ${tema}</h1>
    <form id="formMensagem">
      <input type="hidden" name="assunto" value="${tema}">
      <input type="text" name="usuario" value="${nick}" readonly><br>
      <textarea name="mensagem" id="txtMensagem" rows="4" required></textarea><br>
      <button>Enviar</button>
    </form>
    <h2>Mensagens</h2>
    <div id="mensagens" style="height:300px; overflow:auto; border:1px solid #ccc;">
      ${mensagensHtml}
    </div>
    <script>
      const form = document.getElementById('formMensagem');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const dados = {
          usuario: form.usuario.value,
          assunto: form.assunto.value,
          mensagem: form.mensagem.value
        };
        const resp = await fetch('/postarMensagem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
        const resultado = await resp.json();
        document.getElementById('mensagens').innerHTML = resultado.mensagens.map(m =>
          \`<p><strong>\${m.usuario}</strong> [\${new Date(m.dataHora).toLocaleString()}]: \${m.mensagem}</p>\`
        ).join('');
        form.mensagem.value = '';
        form.mensagem.focus();
      });
    </script>
    <a href="/batepapo.html">Voltar</a> | <a href="/menu.html">Menu</a>
  </body></html>`;
}

servidor.post('/batepapo', verificarLogin, async (req, res) => {
  const { nickname, assunto } = req.body;
  if (!nickname || !assunto) return res.redirect('/batepapo.html');
  const msgs = await carregarJSON('mensagens.json');
  res.send(montarTelaBatePapo(nickname, assunto, msgs));
});

servidor.post('/postarMensagem', verificarLogin, async (req, res) => {
  const { usuario, mensagem = '', assunto } = req.body;
  if (!usuario || !assunto) return res.status(400).json({ erro: 'Dados incompletos' });

  const msgs = await carregarJSON('mensagens.json');
  msgs.push({ usuario, mensagem, assunto, dataHora: new Date().toISOString() });
  await gravarJSON('mensagens.json', msgs);
  const filtradas = msgs.filter(m => m.assunto.toLowerCase() === assunto.toLowerCase());
  res.json({ mensagens: filtradas });
});

servidor.get('/batepapo', verificarLogin, async (req, res) => {
  const { nickname, assunto } = req.query;
  if (!nickname || !assunto) return res.redirect('/batepapo.html');
  const mensagens = await carregarJSON('mensagens.json');
  res.send(montarTelaBatePapo(nickname, assunto, mensagens));
});

servidor.get('/', (req, res) => res.redirect('/login.html'));

servidor.use((req, res) => {
  res.status(404).send('<h1>Erro 404 - Página não existe</h1><a href="/login.html">Login</a>');
});

const porta = process.env.PORT || 3000;
servidor.listen(porta, () => console.log(`Aplicação ativa: http://localhost:${porta}`));
