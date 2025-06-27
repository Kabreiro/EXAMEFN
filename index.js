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
    const agora = new Date().toISOString();
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

// Cadastro de usuário (sem mudanças)

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

// Página batepapo.html: gera select com assuntos cadastrados dinamicamente

app.get('/batepapo.html', protegePagina, async (req, res) => {
  try {
    const usuarios = await lerArquivoJSON('usuarios.json');
    const assuntosUnicos = [...new Set(usuarios.map(u => u.assunto))];

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8" /><title>Sala de Bate-papo</title></head>
      <body>
        <h1>Sala de Bate-papo</h1>
        <form method="POST" action="/batepapo">
          <label>
            Seu Nickname:
            <input type="text" name="nickname" required placeholder="Digite seu nickname" />
          </label>
          <br><br>
          <label>
            Escolha um assunto:
            <select name="assunto" required>
              <option value="">--Selecione--</option>
              ${assuntosUnicos.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </label>
          <br><br>
          <button>Ver mensagens</button>
        </form>
        <br>
        <a href="/menu.html">Voltar ao menu</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro interno do servidor');
  }
});

// POST batepapo: exibe chat com usuários e mensagens do assunto

app.post('/batepapo', protegePagina, async (req, res) => {
  const { nickname, assunto } = req.body;

  if (!nickname || !assunto || nickname.trim() === '' || assunto.trim() === '') {
    return res.send(`
      <h1>Erro</h1>
      <p>Nickname e assunto são obrigatórios.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  const usuarios = await lerArquivoJSON('usuarios.json');
  const usuario = usuarios.find(u => u.nickname.toLowerCase() === nickname.toLowerCase());

  if (!usuario) {
    return res.send(`
      <h1>Erro</h1>
      <p>Nickname não encontrado.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  // Aqui removi a validação do assunto para permitir que o usuário entre no assunto que quiser
  // Porém você pode optar por validar que o usuário tenha cadastro no assunto escolhido (opcional)

  const usuariosDoAssunto = usuarios.filter(u => u.assunto === assunto);
  const mensagens = await lerArquivoJSON('mensagens.json');
  const mensagensDoAssunto = mensagens.filter(m => m.assunto === assunto);

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8" /><title>Bate-papo - ${assunto}</title></head>
    <body>
      <h1>Bate-papo: ${assunto}</h1>
      <form method="POST" action="/postarMensagem">
        <input type="hidden" name="assunto" value="${assunto}" />
        <label>Usuário:
          <select name="usuario" required>
            <option value="">--Selecione usuário--</option>
            ${usuariosDoAssunto.map(u => `<option value="${u.nickname}"${u.nickname === usuario.nickname ? ' selected' : ''}>${u.nome} (${u.nickname})</option>`).join('')}
          </select>
        </label>
        <br><br>
        <label>Mensagem:<br>
          <textarea name="mensagem" rows="4" cols="50" required></textarea>
        </label>
        <br><br>
        <button>Enviar</button>
      </form>
      <hr>
      <h2>Mensagens</h2>
      <div style="border:1px solid #ccc; height:300px; overflow-y:auto; padding:5px;">
        ${mensagensDoAssunto.length === 0 ? '<p>Sem mensagens.</p>' : mensagensDoAssunto.map(m => `<p><b>${m.usuario}</b> [${new Date(m.dataHora).toLocaleString()}]: ${m.mensagem}</p>`).join('')}
      </div>
      <br>
      <a href="/batepapo.html">Voltar à seleção de usuário</a> | <a href="/menu.html">Menu</a>
    </body>
    </html>
  `);
});

// POST postarMensagem: apenas salva mensagem sem revalidar nickname e assunto

app.post('/postarMensagem', protegePagina, async (req, res) => {
  const { usuario, mensagem, assunto } = req.body;

  if (!usuario || !mensagem || !assunto || mensagem.trim() === '') {
    return res.send(`
      <h1>Erro ao postar mensagem</h1>
      <p>Nickname, mensagem e assunto são obrigatórios, e a mensagem não pode estar vazia.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  // Aqui NÃO validamos nickname e assunto para poder enviar mensagens livremente

  const mensagens = await lerArquivoJSON('mensagens.json');
  mensagens.push({
    usuario,
    mensagem,
    assunto,
    dataHora: new Date().toISOString()
  });
  await salvarArquivoJSON('mensagens.json', mensagens);

  // Redireciona para POST /batepapo para recarregar a conversa com usuário e assunto corretos
  // Passando nickname e assunto via query string para facilitar o res.redirect
  res.redirect(307, `/batepapo?nickname=${encodeURIComponent(usuario)}&assunto=${encodeURIComponent(assunto)}`);
});

// Alteração no GET /batepapo para permitir passar nickname e assunto por query string e mostrar o chat

app.get('/batepapo', protegePagina, async (req, res) => {
  const { nickname, assunto } = req.query;

  if (!nickname || !assunto || nickname.trim() === '' || assunto.trim() === '') {
    return res.redirect('/batepapo.html');
  }

  const usuarios = await lerArquivoJSON('usuarios.json');
  const usuario = usuarios.find(u => u.nickname.toLowerCase() === nickname.toLowerCase());

  if (!usuario) {
    return res.send(`
      <h1>Erro</h1>
      <p>Nickname não encontrado.</p>
      <a href="/batepapo.html">Voltar</a>
    `);
  }

  const usuariosDoAssunto = usuarios.filter(u => u.assunto === assunto);
  const mensagens = await lerArquivoJSON('mensagens.json');
  const mensagensDoAssunto = mensagens.filter(m => m.assunto === assunto);

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8" /><title>Bate-papo - ${assunto}</title></head>
    <body>
      <h1>Bate-papo: ${assunto}</h1>
      <form method="POST" action="/postarMensagem">
        <input type="hidden" name="assunto" value="${assunto}" />
        <label>Usuário:
          <select name="usuario" required>
            <option value="">--Selecione usuário--</option>
            ${usuariosDoAssunto.map(u => `<option value="${u.nickname}"${u.nickname === usuario.nickname ? ' selected' : ''}>${u.nome} (${u.nickname})</option>`).join('')}
          </select>
        </label>
        <br><br>
        <label>Mensagem:<br>
          <textarea name="mensagem" rows="4" cols="50" required></textarea>
        </label>
        <br><br>
        <button>Enviar</button>
      </form>
      <hr>
      <h2>Mensagens</h2>
      <div style="border:1px solid #ccc; height:300px; overflow-y:auto; padding:5px;">
        ${mensagensDoAssunto.length === 0 ? '<p>Sem mensagens.</p>' : mensagensDoAssunto.map(m => `<p><b>${m.usuario}</b> [${new Date(m.dataHora).toLocaleString()}]: ${m.mensagem}</p>`).join('')}
      </div>
      <br>
      <a href="/batepapo.html">Voltar à seleção de usuário</a> | <a href="/menu.html">Menu</a>
    </body>
    </html>
  `);
});

app.get('/', (req, res) => res.redirect('/login.html'));

app.use((req, res) => {
  res.status(404).send('<h1>404 - Página não encontrada</h1><a href="/login.html">Login</a>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));
