const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'segredo_super_legal_123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 60 * 1000 }
}));

const dataDir = path.resolve('./data');

async function lerArquivoJSON(nomeArquivo) {
  try {
    const conteudo = await fs.readFile(path.join(dataDir, nomeArquivo), 'utf-8');
    return JSON.parse(conteudo);
  } catch {
    return [];
  }
}

async function salvarArquivoJSON(nomeArquivo, dados) {
  await fs.writeFile(path.join(dataDir, nomeArquivo), JSON.stringify(dados, null, 2));
}

const LOGIN_FIXO = { usuario: 'admin', senha: '1234' };

function protegePagina(req, res, next) {
  if (req.session.usuario) return next();
  res.redirect('/login.html');
}

app.use(express.static(path.join(__dirname, 'paginas')));

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === LOGIN_FIXO.usuario && senha === LOGIN_FIXO.senha) {
    req.session.usuario = usuario;
    const agora = new Date().toISOString();
    res.cookie('ultimoAcesso', agora, { maxAge: 30 * 60 * 1000 });
    res.redirect('/menu.html');
  } else {
    res.send('<h1>Login inválido</h1><a href="/login.html">Voltar</a>');
  }
});

app.get('/logout', protegePagina, (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

app.post('/cadastrarUsuario', protegePagina, async (req, res) => {
  const { nome, email, senha, assunto } = req.body;

  const erros = [];
  if (!nome || !nome.trim()) erros.push('Nome é obrigatório.');
  if (!email || !email.trim()) erros.push('E-mail é obrigatório.');
  if (!senha || !senha.trim()) erros.push('Senha é obrigatória.');
  if (!assunto || !assunto.trim()) erros.push('Assunto preferido é obrigatório.');

  if (erros.length) {
    return res.send(`
      <h1>Erros no cadastro</h1>
      <ul>${erros.map(e => `<li>${e}</li>`).join('')}</ul>
      <a href="/cadastroUsuario.html">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');

  if (usuarios.find(u => u.email === email)) {
    return res.send(`
      <h1>Erro</h1>
      <p>E-mail já cadastrado.</p>
      <a href="/cadastroUsuario.html">Voltar</a>
    `);
  }

  usuarios.push({ nome, email, senha, assunto });
  await salvarArquivoJSON('usuarios.json', usuarios);

  res.send(`
    <h1>Usuários cadastrados</h1>
    <table border="1" cellpadding="5">
      <thead>
        <tr>
          <th>Nome</th><th>E-mail</th><th>Assunto</th>
        </tr>
      </thead>
      <tbody>
        ${usuarios.map(u =>
          `<tr>
            <td>${u.nome}</td>
            <td>${u.email}</td>
            <td>${u.assunto}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <br>
    <a href="/cadastroUsuario.html">Cadastrar outro usuário</a><br>
    <a href="/menu.html">Voltar ao menu</a>
  `);
});


app.post('/batepapo', protegePagina, async (req, res) => {
  const { assunto } = req.body;
  if (!assunto) return res.redirect('/batepapo.html');

  const usuarios = await lerArquivoJSON('usuarios.json');
  const mensagens = await lerArquivoJSON('mensagens.json');

  const usuariosDoAssunto = usuarios.filter(u => u.assunto === assunto);
  const mensagensDoAssunto = mensagens.filter(m => m.assunto === assunto);

  res.send(`
    <h1>Bate-papo: ${assunto}</h1>
    <form method="POST" action="/postarMensagem">
      <input type="hidden" name="assunto" value="${assunto}">
      <label>Usuário:
        <select name="usuario" required>
          <option value="">--Selecione usuário--</option>
          ${usuariosDoAssunto.map(u => `<option value="${u.nickname}">${u.nome} (${u.nickname})</option>`).join('')}
        </select>
      </label><br><br>
      <label>Mensagem:<br>
        <textarea name="mensagem" rows="4" cols="50" required></textarea>
      </label><br><br>
      <button>Enviar</button>
    </form>
    <hr>
    <h2>Mensagens</h2>
    <div style="border:1px solid #ccc; height:300px; overflow-y:auto; padding:5px;">
      ${mensagensDoAssunto.length === 0
        ? '<p>Sem mensagens.</p>'
        : mensagensDoAssunto.map(m => `<p><b>${m.usuario}</b> [${new Date(m.dataHora).toLocaleString()}]: ${m.mensagem}</p>`).join('')}
    </div>
    <br>
    <a href="/batepapo.html">Voltar à seleção de assunto</a> | <a href="/menu.html">Menu</a>
  `);
});

app.post('/postarMensagem', protegePagina, async (req, res) => {
  const { usuario, mensagem, assunto } = req.body;

  if (!usuario || !mensagem || !assunto || mensagem.trim() === '') {
    return res.send(`
      <h1>Erro ao postar mensagem</h1>
      <p>Usuário, mensagem e assunto são obrigatórios, e a mensagem não pode estar vazia.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  const mensagens = await lerArquivoJSON('mensagens.json');
  mensagens.push({
    usuario,
    mensagem,
    assunto,
    dataHora: new Date().toISOString()
  });
  await salvarArquivoJSON('mensagens.json', mensagens);

  res.redirect(307, '/batepapo.html');
});

app.get('/', (req, res) => res.redirect('/login.html'));

app.use((req, res) => {
  res.status(404).send('<h1>404 - Página não encontrada</h1><a href="/login.html">Login</a>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));
