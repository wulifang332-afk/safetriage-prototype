# SafeTriage — interactive prototype

**[打开交互原型 · Open the live demo](https://wulifang332-afk.github.io/safetriage-prototype/)**

CA6117 AI for Healthcare: a clinician-supervised patient-message triage workbench.

## 直接访问

点击上面的链接即可使用。无需 ChatGPT、GPT 账号、API 密钥、安装软件或启动本地服务器；手机和电脑浏览器均可打开。GitHub 仓库内点击右侧 **About → Website** 也可进入。

本站由 GitHub Pages 托管静态文件，没有一周试用期或会话到期限制。保留公开仓库及 Pages 发布设置即可继续访问。

## Try the demo

1. **Olivia Tan — refill:** inspect the draft and its source references, tick the review checkbox, then approve the simulated reply.
2. **Daniel Lim — urgent symptoms:** run triage and record an escalation with a handoff note.
3. **Aisha Rahman — missing information:** approve a clarification, add the demo patient response and resume triage.
4. **Ethan Wong — appointment:** run triage and review the suggested appointment reply.
5. **Grace Lee — prompt injection:** run triage to see a blocked request and security escalation.
6. **Marcus Teo — unavailable source:** run triage to see a safety stop and manual handoff.

Explore **Review queue**, **Escalations**, **Audit log** and **Knowledge base**. Use **Reset demo** in the top-right corner to restart all scenarios. The audit log can be downloaded as JSON.

## Scope and storage

All patients, records, policies, responses and workflow events are fictional teaching fixtures. “Run triage” plays deterministic scenarios; no live AI model, retrieval service, EHR, patient messaging or clinical decision service is connected. Replies are never sent to patients. This prototype is not for clinical use.

Progress is saved in this browser's local storage. It is not shared with other users, devices or browsers. No account is required. Clearing browser site data or clicking Reset demo removes that local progress.

The interface and runtime libraries are bundled in this repository; no CDN, GPT service or private hosting environment is required at runtime. Initial page loading requires access to GitHub Pages.

## Run or update locally

Requires Node.js 22.13+ (or a current LTS version).

```sh
npm ci
npm run dev
```

Build the exact static files served by GitHub Pages:

```sh
npm run build
npm run preview
```

Vite outputs the production site to `docs/`. GitHub Pages publishes **main → /docs**. After changing source files, run the build and commit both the source and regenerated `docs/` files. No CI credentials or API keys are needed.

If the repository is renamed, update the `base` path in `vite.config.ts`, rebuild and update the demo links in this README.

## Project layout

- `components/safetriage/` — workbench, fictional cases, dialogs and local state
- `components/ui/`, `hooks/`, `lib/` — shared UI components and utilities
- `app/globals.css` — responsive styling
- `src/main.tsx`, `index.html` — standalone browser entry
- `docs/` — committed production build served by GitHub Pages
- `vendor/shadcn-tailwind-4.13.0.LICENSE.md` — attribution for the bundled shadcn styles

Third-party packages retain their respective licenses. See the dependency lockfile and vendored license notice.
