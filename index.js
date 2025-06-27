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
    res.cookie('ultimoAcesso', new Date().toISOString(), { maxAge: 30 * 60 * 1000, httpOnly: true });
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
  const mensagem = ultimoAcesso
    ? `Último acesso: ${new Date(ultimoAcesso).toLocaleString('pt-BR')}`
    : 'Último acesso: não disponível.';
  res.send(`
    <h1>Menu do Sistema</h1>
    <p>${mensagem}</p>
    <ul>
      <li><a href="/batepapo.html">Bate-papo</a></li>
      <li><a href="/logout">Logout</a></li>
    </ul>
  `);
});

app.get('/batepapo.html', protegePagina, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Entrar no Bate-papo</title></head>
    <body>
      <h1>Entrar no Bate-papo</h1>
      <form method="POST" action="/batepapo">
        <label>Digite seu nickname:<br>
          <input type="text" name="nickname">
        </label><br><br>
        <label>Digite o assunto:<br>
          <input type="text" name="assunto">
        </label><br><br>
        <button>Entrar</button>
      </form>
      <br><a href="/menu.html">Voltar ao menu</a>
    </body>
    </html>
  `);
});

function gerarPaginaBatePapo(nickname, assunto, mensagens) {
  const mensagensFiltradas = mensagens.filter(m => m.assunto.toLowerCase() === assunto.toLowerCase());
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Bate-papo - ${assunto}</title>
    </head>
    <body>
      <h1>Bate-papo: ${assunto}</h1>
      <form id="formMensagem">
        <input type="hidden" name="assunto" value="${assunto}">
        <label>Usuário:
          <input type="text" name="usuario" value="${nickname}" readonly>
        </label><br><br>
        <label>Mensagem:<br>
          <textarea name="mensagem" id="txtMensagem" rows="4" cols="50"></textarea>
        </label><br><br>
        <button type="submit">Enviar</button>
      </form>
      <hr><h2>Mensagens</h2>
      <div id="divMensagens" style="border:1px solid #ccc; height:300px; overflow-y:auto; padding:5px;">
        ${mensagensFiltradas.length === 0
          ? '<p>Sem mensagens.</p>'
          : mensagensFiltradas.map(m => `<p><b>${m.usuario}</b> [${new Date(m.dataHora).toLocaleString()}]: ${m.mensagem}</p>`).join('')}
      </div>
      <br><a href="/batepapo.html">Voltar</a> | <a href="/menu.html">Menu</a>

      <script>
        const form = document.getElementById('formMensagem');
        const divMensagens = document.getElementById('divMensagens');
        const txtMensagem = document.getElementById('txtMensagem');

        form.addEventListener('submit', async e => {
          e.preventDefault();

          const formData = new FormData(form);

          const response = await fetch('/postarMensagem', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            alert('Erro ao enviar mensagem.');
            return;
          }

          const data = await response.json();

          if (data.mensagens.length === 0) {
            divMensagens.innerHTML = '<p>Sem mensagens.</p>';
          } else {
            divMensagens.innerHTML = data.mensagens.map(m =>
              \`<p><b>\${m.usuario}</b> [\${new Date(m.dataHora).toLocaleString()}]: \${m.mensagem}</p>\`
            ).join('');
          }

          txtMensagem.value = '';
          txtMensagem.focus();
          divMensagens.scrollTop = divMensagens.scrollHeight; // rolar pra baixo
        });
      </script>
    </body>
    </html>
  `;
}

app.post('/batepapo', protegePagina, async (req, res) => {
  const { nickname, assunto } = req.body;
  if (!nickname || !assunto) return res.redirect('/batepapo.html');
  const mensagens = await lerArquivoJSON('mensagens.json');
  res.send(gerarPaginaBatePapo(nickname, assunto, mensagens));
});

app.post('/postarMensagem', protegePagina, async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      express.urlencoded({ extended: true })(req, res, err => err ? reject(err) : resolve());
    });

    const { usuario, mensagem = '', assunto } = req.body;

    if (!usuario || !assunto) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }

    const mensagens = await lerArquivoJSON('mensagens.json');
    mensagens.push({ usuario, mensagem, assunto, dataHora: new Date().toISOString() });
    await salvarArquivoJSON('mensagens.json', mensagens);

    const mensagensFiltradas = mensagens.filter(m => m.assunto.toLowerCase() === assunto.toLowerCase());
    return res.json({ mensagens: mensagensFiltradas });
  } catch (error) {
    console.error('Erro em /postarMensagem:', error);
    return res.status(500).json({ erro: 'Erro interno no servidor' });
  }
});

app.get('/batepapo', protegePagina, async (req, res) => {
  const { nickname, assunto } = req.query;
  if (!nickname || !assunto) return res.redirect('/batepapo.html');
  const mensagens = await lerArquivoJSON('mensagens.json');
  res.send(gerarPaginaBatePapo(nickname, assunto, mensagens));
});

app.get('/', (req, res) => res.redirect('/login.html'));

app.use((req, res) => {
  res.status(404).send('<h1>404 - Página não encontrada</h1><a href="/login.html">Login</a>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));
