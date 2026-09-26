# Fernando Gregório — Portfólio

Portfólio digital pessoal em página única (HTML/CSS/JS puro, sem build step), com sistema de design próprio.

## Seções
Início, Sobre, Projetos, Habilidades, Credenciais e Contato.

## Idiomas (PT / EN / ES)
- O texto em português fica no próprio HTML e nos dados (`PROJECTS`, `SKILLS`, `CERTS`).
- Inglês e espanhol ficam no objeto `T` do script "IDIOMAS", em `index.html`.
- Todo texto traduzível tem `data-i18n="chave"` (ou `data-i18n-html` / `data-i18n-aria`).
- Para adicionar um texto: coloque `data-i18n="minha.chave"` no elemento e crie `"minha.chave"` em `T.en` e `T.es`. Se faltar a chave, o site mostra o texto em PT.
- A escolha fica salva em `localStorage` (`lang`). Na primeira visita vale o idioma do navegador (pt, en ou es; qualquer outro cai em PT).

## Tela de boas-vindas
Aparece uma vez por aba (`sessionStorage` → `intro-done`), pode ser pulada com clique ou tecla e não aparece com `prefers-reduced-motion: reduce`.

## Arquivos
- `index.html` — o site
- `demos/` — demos interativas dos projetos (WMS 3D, DPA Etiquetas, Controle de Ativos)
- `og-image.png` — imagem de prévia de compartilhamento (1200×630)
- `favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png` — ícones

## Deploy
Vercel, conectado ao GitHub (push na `main` publica automaticamente).
