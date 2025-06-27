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
  cookie: { maxAge: 30 * 60 * 1000 } // 30 minutos
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
    // Atualiza o cookie do último acesso antes de enviar a página menu
    const agora = new Date().toISOString();
    // Envia cookie com a hora atual e também armazena no req.session para mostrar já no menu sem esperar próxima requisição
    res.cookie('ultimoAcesso', agora, { maxAge: 30 * 60 * 1000, httpOnly: true });
    res.redirect('/menu.html');
  } else {
    res.send('<h1>Login inválido</h1><a href="/login.html">Voltar</a>');
  }
});

app.get('/logout', protegePagina, (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

app.get('/menu.html', protegePagina, (req, res) => {
  // Pega o cookie ultimoAcesso para mostrar no menu
  const ultimoAcesso = req.cookies.ultimoAcesso;
  let mensagem = 'Último acesso: não disponível.';
  if (ultimoAcesso) {
    const data = new Date(ultimoAcesso);
    if (!isNaN(data.getTime())) {
      mensagem = `Último acesso: ${data.toLocaleString('pt-BR')}`;
    }
  }
  res.send(`
    <h1>Menu do Sistema</h1>
    <p>${mensagem}</p>
    <ul>
      <li><a href="/cadastroUsuario.html">Cadastro de Usuários</a></li>
      <li><a href="/batepapo.html">Bate-papo</a></li>
      <li><a href="/logout">Logout</a></li>
    </ul>
  `);
});

// Cadastro usuário (sem alterações)

app.post('/cadastrarUsuario', protegePagina, async (req, res) => {
  const { nome, dataNascimento, nickname, assunto } = req.body;
  const erros = [];

  if (!nome || !nome.trim()) erros.push('Nome é obrigatório.');
  if (!dataNascimento || !dataNascimento.trim()) erros.push('Data de nascimento é obrigatória.');
  if (!nickname || !nickname.trim()) erros.push('Nickname é obrigatório.');
  if (!assunto || !assunto.trim()) erros.push('Assunto preferido é obrigatório.');

  if (erros.length > 0) {
    return res.send(`
      <h1>Erros no cadastro</h1>
      <ul>${erros.map(e => `<li>${e}</li>`).join('')}</ul>
      <a href="/cadastroUsuario.html">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');

  if (usuarios.find(u => u.nickname === nickname)) {
    return res.send(`
      <h1>Erro</h1>
      <p>Nickname já cadastrado.</p>
      <a href="/cadastroUsuario.html">Voltar</a>
    `);
  }

  usuarios.push({ nome, dataNascimento, nickname, assunto });
  await salvarArquivoJSON('usuarios.json', usuarios);

  res.send(`
    <h1>Usuários cadastrados</h1>
    <table border="1" cellpadding="5">
      <thead>
        <tr><th>Nome</th><th>Data de Nascimento</th><th>Nickname</th><th>Assunto Preferido</th></tr>
      </thead>
      <tbody>
        ${usuarios.map(u => `
          <tr>
            <td>${u.nome}</td>
            <td>${u.dataNascimento}</td>
            <td>${u.nickname}</td>
            <td>${u.assunto}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <br>
    <a href="/cadastroUsuario.html">Cadastrar outro usuário</a><br>
    <a href="/menu.html">Voltar ao menu</a>
  `);
});

// Rota batepapo.html - agora gera dinamicamente o select com assuntos únicos cadastrados

app.get('/batepapo.html', protegePagina, async (req, res) => {
  const usuarios = await lerArquivoJSON('usuarios.json');
  // Extrai assuntos únicos
  const assuntos = [...new Set(usuarios.map(u => u.assunto))].sort();

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Seleção de Bate-papo</title></head>
    <body>
      <h1>Selecione o Assunto do Bate-papo</h1>
      <form method="POST" action="/batepapo">
        <label>Assunto:
          <select name="assunto" required>
            <option value="">--Selecione--</option>
            ${assuntos.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </label><br><br>
        <label>Nickname:
          <input type="text" name="nickname" required />
        </label><br><br>
        <button>Entrar</button>
      </form>
      <br>
      <a href="/menu.html">Voltar ao menu</a>
    </body>
    </html>
  `);
});

// Rota POST batepapo (sem mudanças)

app.post('/batepapo', protegePagina, async (req, res) => {
  const { assunto, nickname } = req.body;
  if (!assunto || !nickname || nickname.trim() === '') {
    return res.send(`
      <h1>Erro</h1>
      <p>Assunto e nickname são obrigatórios.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');
  const mensagens = await lerArquivoJSON('mensagens.json');

  const usuarioValido = usuarios.find(u => u.nickname === nickname && u.assunto === assunto);
  if (!usuarioValido) {
    return res.send(`
      <h1>Erro</h1>
      <p>Nickname inválido para o assunto selecionado.</p>
      <a href="/batepapo.html">Voltar</a>
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
      ${mensagensDoAssunto.length === 0 ? '<p>Sem mensagens.</p>' : mensagensDoAssunto.map(m => `<p><b>${m.usuario}</b> [${new Date(m.dataHora).toLocaleString('pt-BR')}]: ${m.mensagem}</p>`).join('')}
    </div>
    <br>
    <a href="/batepapo.html">Voltar à seleção de assunto</a> | <a href="/menu.html">Menu</a>
  `);
});

// Rota postar mensagem (sem mudanças)

app.post('/postarMensagem', protegePagina, async (req, res) => {
  const { usuario, mensagem, assunto } = req.body;

  if (!usuario || !mensagem || !assunto || mensagem.trim() === '') {
    return res.send(`
      <h1>Erro ao postar mensagem</h1>
      <p>Nickname, mensagem e assunto são obrigatórios, e a mensagem não pode estar vazia.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');
  const usuariosDoAssunto = usuarios.filter(u => u.assunto === assunto);
  const usuarioValido = usuariosDoAssunto.find(u => u.nickname === usuario);
  if (!usuarioValido) {
    return res.send(`
      <h1>Erro ao postar mensagem</h1>
      <p>Nickname inválido para o assunto escolhido.</p>
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

  // Redireciona para a rota POST /batepapo para recarregar mensagens com mesmo assunto e usuário
  res.redirect(307, '/batepapo');
});

app.get('/', (req, res) => res.redirect('/login.html'));

app.use((req, res) => {
  res.status(404).send('<h1>404 - Página não encontrada</h1><a href="/login.html">Login</a>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));
