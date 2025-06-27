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

// Login
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

// Logout
app.get('/logout', protegePagina, (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Menu com data do último acesso
app.get('/menu.html', protegePagina, (req, res) => {
  const ultimoAcesso = req.cookies.ultimoAcesso;
  let mensagem = 'Último acesso: não disponível.';
  if (ultimoAcesso) {
    const data = new Date(ultimoAcesso);
    mensagem = `Último acesso: ${data.toLocaleString()}`;
  }

  res.send(`
    <h1>Menu do Sistema</h1>
    <p>${mensagem}</p>
    <ul>
      <li><a href="/cadastroUsuario.html">Cadastro de Usuários</a></li>
      <li><a href="/batepapo">Bate-papo</a></li>
      <li><a href="/logout">Logout</a></li>
    </ul>
  `);
});

// Página bate-papo dinâmica com lista de assuntos e input para nickname
app.get('/batepapo', protegePagina, async (req, res) => {
  try {
    const usuarios = await lerArquivoJSON('usuarios.json');
    // Extrai todos os assuntos únicos
    const assuntosUnicos = [...new Set(usuarios.map(u => u.assunto))];

    const opcoes = assuntosUnicos.map(assunto => `<option value="${assunto}">${assunto}</option>`).join('\n');

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8" /><title>Sala de Bate-papo</title></head>
      <body>
        <h1>Sala de Bate-papo</h1>
        <form method="POST" action="/batepapo">
          <label>Escolha um assunto:
            <select name="assunto" required>
              <option value="">--Selecione--</option>
              ${opcoes}
            </select>
          </label><br><br>
          <label>Digite seu nickname:
            <input type="text" name="nickname" required />
          </label><br><br>
          <button>Entrar no Bate-papo</button>
        </form>
        <br>
        <a href="/menu.html">Voltar ao Menu</a>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Erro ao carregar batepapo:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Processa seleção de assunto e nickname, mostra mensagens e formulário de envio
app.post('/batepapo', protegePagina, async (req, res) => {
  const { assunto, nickname } = req.body;

  if (!assunto || !nickname || nickname.trim() === '') {
    return res.send(`
      <h1>Erro</h1>
      <p>Assunto e nickname são obrigatórios.</p>
      <a href="/batepapo">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');
  const mensagens = await lerArquivoJSON('mensagens.json');

  // Verifica se o nickname é válido para o assunto
  const usuarioSelecionado = usuarios.find(u => u.nickname === nickname && u.assunto === assunto);
  if (!usuarioSelecionado) {
    return res.send(`
      <h1>Erro</h1>
      <p>Nickname inválido para o assunto selecionado.</p>
      <a href="/batepapo">Voltar</a>
    `);
  }

  const usuariosDoAssunto = usuarios.filter(u => u.assunto === assunto);
  const mensagensDoAssunto = mensagens.filter(m => m.assunto === assunto);

  res.send(`
    <h1>Bate-papo: ${assunto}</h1>
    <form method="POST" action="/postarMensagem">
      <input type="hidden" name="assunto" value="${assunto}">
      <label>Usuário:
        <select name="usuario" required>
          <option value="">--Selecione usuário--</option>
          ${usuariosDoAssunto.map(u => `<option value="${u.nickname}"${u.nickname === nickname ? ' selected' : ''}>${u.nome} (${u.nickname})</option>`).join('')}
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
    <a href="/batepapo">Voltar à seleção de assunto</a> | <a href="/menu.html">Menu</a>
  `);
});

// Posta uma nova mensagem no bate-papo
app.post('/postarMensagem', protegePagina, async (req, res) => {
  const { usuario, mensagem, assunto } = req.body;

  if (!usuario || !mensagem || !assunto || mensagem.trim() === '') {
    return res.send(`
      <h1>Erro ao postar mensagem</h1>
      <p>Nickname, mensagem e assunto são obrigatórios, e a mensagem não pode estar vazia.</p>
      <a href="/batepapo">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');
  const usuariosDoAssunto = usuarios.filter(u => u.assunto === assunto);
  const usuarioValido = usuariosDoAssunto.find(u => u.nickname === usuario);
  if (!usuarioValido) {
    return res.send(`
      <h1>Erro ao postar mensagem</h1>
      <p>Nickname inválido para o assunto escolhido.</p>
      <a href="/batepapo">Voltar</a>
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

  res.redirect(307, '/batepapo');
});

app.get('/', (req, res) => res.redirect('/login.html'));

app.use((req, res) => {
  res.status(404).send('<h1>404 - Página não encontrada</h1><a href="/login.html">Login</a>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));
