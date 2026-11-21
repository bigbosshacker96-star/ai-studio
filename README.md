# ⚡ AI Studio — Chat · Image · Code

AI দিয়ে চ্যাট, ইমেজ জেনারেট আর কোড লেখার ওয়েবসাইট। **কোনো ক্রেডিট লাগবে না — ফ্রি AI provider ব্যবহার করে।** সাথে পাসওয়ার্ড-প্রোটেক্টেড **Admin Panel**।

## চালানোর নিয়ম

```bash
npm install
npm start
```

তারপর ব্রাউজারে খুলুন: `http://localhost:3000`

- **Main site:** `http://localhost:3000` — নাম লিখে ঢুকলেই Chat / Image / Code ট্যাব পাওয়া যাবে
- **Admin panel:** `http://localhost:3000/admin`

## Admin Panel

- ডিফল্ট পাসওয়ার্ড: `admin123` — পরিবর্তন করতে চালানোর সময় env দিন:
  ```bash
  ADMIN_PASSWORD=your-secret-password npm start
  ```
- Admin panel-এ দেখা যাবে: মোট ইউজার, মোট চ্যাট, ইমেজ, কোড রান
- ইউজার লিস্ট (তারিখ + ব্যবহারের হিসাব), সার্চ ও ডিলিট করা যায়

## নিজের Mistral API key ব্যবহার (optional)

সার্ভার ডিফল্টে ফ্রি AI provider ব্যবহার করে (কোনো key ছাড়াই কাজ করে)।
চাইলে Settings ট্যাবে নিজের Mistral API key দিতে পারেন — key শুধু ব্রাউজারে (localStorage) থাকে, সার্ভারে সেভ হয় না। অথবা:

```bash
MISTRAL_API_KEY=sk-... npm start
```

key থাকলে Mistral (mistral-small-latest) ব্যবহার হবে, না থাকলে ফ্রি fallback।

### API key protection (নিজের API লক করতে)

```bash
API_SECRET=my-secret-key-123 npm start
```

সেট করলে Direct API call-এ `x-api-key: my-secret-key-123` হেডার লাগবে:

```bash
curl -X POST https://your-url.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: my-secret-key-123" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

সাইটে নাম দিয়ে ঢোকা ইউজাররা অটো session টোকেন পায় — তাদের কিছু করতে হয় না।

## ফোল্ডার

```
ai-web/
├── server.js          # Express backend (chat, code, image, admin APIs)
├── data.json          # ইউজার ডেটা (অটো তৈরি হয়)
├── package.json
└── public/
    ├── index.html     # Main site (Chat / Image / Code)
    ├── admin.html     # Admin Panel (পাসওয়ার্ড দিয়ে লগইন)
    ├── app.js         # Main site JS
    ├── admin.js       # Admin panel JS
    └── style.css      # সব স্টাইল (ডার্ক থিম)
```

## ফিচার

- 💬 **Chat** / 🎨 **Image** / 👨‍💻 **Code** — সব ফ্রি AI provider দিয়ে, key ছাড়াই
- 🥰 **Girlfriend mood** — Chat ট্যাবে mood সিলেক্ট করুন (Normal / Girlfriend "Meera") — sweet, caring companion হয়ে যায়
- 📥 **Image download** — জেনারেট করা ইমেজ এক ক্লিকে ডাউনলোড
- 🔐 **Admin Panel** — পাসওয়ার্ড দিয়ে লগইন, ইউজার লিস্ট + স্ট্যাটস + ডিলিট
- ✨ **৪টা ডিজাইন থিম** — সাইটে উপরের ডান কোণায় **⋮ (থ্রি-ডট)** বাটনে ট্যাপ করে ডিজাইন বদলান (🌌 Cyberpunk / ☀️ Light / 💜 Purple / 🌿 Mint) — সিলেকশন সেভ হয়ে থাকে
- 🔑 **API key protection** — `API_SECRET` env সেট করলে AI API শুধু আপনার key বা সাইটে লগইন করা ইউজাররা ব্যবহার করতে পারবে
- 🚦 **Rate limit** — প্রতি IP-তে মিনিটে ৪০টা রিকোয়েস্ট

## API (একই সার্ভার দিয়ে নিজের API বানাতে পারবেন)

| Endpoint | Method | Body |
|---|---|---|
| `/api/chat` | POST | `{ messages: [{role, content}], mood?: "normal"\|"girlfriend" }` |
| `/api/code` | POST | `{ messages: [...] }` (কোড-ফোকাসড) |
| `/api/image` | POST | `{ prompt, width, height }` → `{ url }` |
| `/api/users/register` | POST | `{ username }` |
| `/api/usage` | POST | `{ username, type: chat\|image\|code }` |
| `/api/admin/login` | POST | `{ password }` → `{ token }` |
| `/api/admin/stats` | GET | header: `x-admin-token` |
| `/api/admin/users` | GET | header: `x-admin-token` |

**নোট:** এটা localhost/নিজের সার্ভারে চালানোর জন্য। ইন্টারনেটে প্রকাশ করলে HTTPS আর শক্তিশালী পাসওয়ার্ড ব্যবহার করবেন।
