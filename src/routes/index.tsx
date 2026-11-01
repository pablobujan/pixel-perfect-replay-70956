import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { SESSION_LIMIT_SECONDS, useSessionTimer } from "@/hooks/use-session-timer";
import { Calendar, User, ChevronRight, Mail, Phone, IdCard, Home, Plane, Bell } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modo Anxo Carro · CD Lugo" },
      { name: "description", content: "Desconecta del móvil y vive el partido del CD Lugo en el Anxo Carro." },
      { property: "og:title", content: "Modo Anxo Carro · CD Lugo" },
      { property: "og:description", content: "Desconecta del móvil y vive el partido del CD Lugo en el Anxo Carro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Crest({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 100 115" aria-label="Escudo CD Lugo">
      <path d="M50 3 L95 15 V55 C95 85 72 103 50 112 C28 103 5 85 5 55 V15 Z" fill="var(--silver)" />
      <path d="M50 9 L89 19 V55 C89 81 69 97 50 105 C31 97 11 81 11 55 V19 Z" fill="var(--primary)" />
      <path d="M50 9 V105 C31 97 11 81 11 55 V19 Z" fill="var(--foreground)" opacity=".95" />
      <text x="50" y="66" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="25" fill="var(--background)" stroke="var(--silver)" strokeWidth=".5">CDL</text>
    </svg>
  );
}

function Ball({ className = "", color = "var(--primary)" }: { className?: string; color?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <clipPath id={`ball${id}`}><circle cx="12" cy="12" r="10.5" /></clipPath>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="var(--ball-surface, var(--card))" />
      <g clipPath={`url(#ball${id})`} stroke={color} strokeWidth=".65" strokeLinejoin="round">
        <path d="M12 7 L16.76 10.46 L14.94 16.05 H9.06 L7.24 10.46 Z" fill={color} />
        <path d="M9 0 H15 L15.5 3.4 L12 5 L8.5 3.4 Z M0 6 L3.2 5.8 L5.4 9 L3.5 12 L0 11 Z M24 6 L20.8 5.8 L18.6 9 L20.5 12 L24 11 Z M2 21 L4.5 16.8 L8 17.2 L9 20.8 L6 24 Z M22 21 L19.5 16.8 L16 17.2 L15 20.8 L18 24 Z" fill={color} />
        <path d="M12 7 V5 M7.24 10.46 L5.4 9 M16.76 10.46 L18.6 9 M9.06 16.05 L8 17.2 M14.94 16.05 L16 17.2 M8.5 3.4 L3.2 5.8 M15.5 3.4 L20.8 5.8 M3.5 12 L4.5 16.8 M20.5 12 L19.5 16.8 M9 20.8 H15" fill="none" />
      </g>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button {...props} className="primary-action w-full" />;
}

type UserData = { name: string; email: string; phone: string; member: string; notif: boolean };
type UserProps = { user: UserData; setUser: (u: UserData) => void };
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const shortName = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ") || "Socio";

function Index() {
  const [step, setStep] = useState<"splash" | "register" | "app">("splash");
  const [user, setUser] = useState<UserData>({ name: "", email: "", phone: "", member: "", notif: true });
  return (
    <div className="app-stage flex min-h-screen justify-center bg-muted">
      <div className="app-frame relative flex min-h-screen w-full max-w-[480px] flex-col bg-background">
        <div key={step} className="animate-screen-in flex min-h-0 flex-1 flex-col">
          {step === "splash" && <Splash onNext={() => setStep("register")} />}
          {step === "register" && <Register user={user} setUser={setUser} onNext={() => setStep("app")} />}
          {step === "app" && <AppShell user={user} setUser={setUser} />}
        </div>
      </div>
    </div>
  );
}

function Splash({ onNext }: { onNext: () => void }) {
  return (
    <div className="welcome-screen flex flex-1 flex-col items-center justify-between px-8 py-12 text-center">
      <div />
      <div className="flex flex-col items-center gap-8">
        <Crest size={130} />
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight">Vive el partido</h1>
          <p className="mt-3 font-display text-2xl font-semibold text-primary">en el Anxo Carro</p>
          <p className="mt-6 text-base leading-7 text-muted-foreground">Guarda el móvil. Cada minuto en la grada cuenta. Aquí se anima con el corazón, no con la pantalla.</p>
        </div>
      </div>
      <Btn onClick={onNext}>Comenzar</Btn>
    </div>
  );
}

function Field({ icon: Icon, ...p }: { icon: typeof Mail } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="form-field flex items-center gap-3 rounded-lg border border-input bg-card px-4 py-4 focus-within:border-primary">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <input {...p} aria-label={p.placeholder} required className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
    </label>
  );
}

function Register({ onNext, user, setUser }: { onNext: () => void } & UserProps) {
  const bind = (k: "name" | "email" | "phone" | "member") => ({ value: user[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setUser({ ...user, [k]: e.target.value }) });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="register-screen flex flex-1 flex-col px-7 py-9">
      <div className="flex items-center gap-3"><Crest size={40} /><span className="font-display text-lg font-bold">CD Lugo</span></div>
      <h2 className="mt-14 font-display text-3xl font-bold leading-tight">Identifícate</h2>
      <p className="mb-9 mt-3 text-sm leading-6 text-muted-foreground">Acceso rápido para socios.</p>
      <div className="flex flex-col gap-4">
        <Field icon={User} placeholder="Nombre completo" {...bind("name")} />
        <Field icon={Mail} type="email" placeholder="Correo electrónico" {...bind("email")} />
        <Field icon={Phone} type="tel" placeholder="Teléfono móvil" {...bind("phone")} />
        <Field icon={IdCard} inputMode="numeric" placeholder="Número de socio" {...bind("member")} />
      </div>
      <div className="mt-auto pt-8"><Btn type="submit">Entrar al Anxo Carro</Btn></div>
    </form>
  );
}

type Tab = "cal" | "mode" | "profile";
function AppShell({ user, setUser }: UserProps) {
  const [tab, setTab] = useState<Tab>("mode");
  const seconds = useSessionTimer();
  const items: { id: Tab; label: string }[] = [{ id: "cal", label: "Calendario" }, { id: "mode", label: "Anxo Carro" }, { id: "profile", label: "Perfil" }];
  return (
    <>
      <header className="app-header flex items-center gap-3 border-b border-border px-7 py-5">
        <Crest size={30} /><span className="font-display text-base font-bold">CD Lugo</span>
      </header>
      <main key={tab} className="animate-screen-in flex-1 overflow-y-auto pb-28">
        {tab === "cal" && <CalendarView />}
        {tab === "mode" && <ModeView secs={seconds} />}
        {tab === "profile" && <ProfileView user={user} setUser={setUser} />}
      </main>
      <nav className="bottom-nav fixed bottom-0 w-full max-w-[480px] border-t border-border bg-card px-6 pb-4 pt-3">
        <div className="flex items-center justify-between">
          {items.map((it) => {
            const active = tab === it.id;
            if (it.id === "mode")
              return (
                <Button variant="ghost" aria-current={active ? "page" : undefined} key={it.id} onClick={() => setTab("mode")} className="nav-item flex flex-col items-center gap-1">
                  <span className={`flex h-10 w-14 items-center justify-center rounded-lg ${active ? "bg-primary shadow-sm" : "bg-muted"}`}><Ball className="nav-ball h-6 w-6" color={active ? "var(--primary-foreground)" : "var(--primary)"} /></span>
                  <span className={`text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>{it.label}</span>
                </Button>
              );
            const Icon = it.id === "cal" ? Calendar : User;
            return (
              <Button variant="ghost" aria-current={active ? "page" : undefined} key={it.id} onClick={() => setTab(it.id)} className={`nav-item flex w-20 flex-col items-center gap-2 py-2 ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-6 w-6" /><span className="text-xs">{it.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

const past = [
  { rival: "Ourense CF", gf: 2, ga: 1, date: "19 oct", home: true },
  { rival: "Real Avilés", gf: 0, ga: 0, date: "12 oct", home: false },
  { rival: "Zamora CF", gf: 3, ga: 1, date: "5 oct", home: true },
  { rival: "Arenteiro", gf: 1, ga: 2, date: "28 sep", home: false },
  { rival: "Ponferradina", gf: 1, ga: 1, date: "21 sep", home: true },
];

function CalendarView() {
  return (
    <div className="content-screen px-7 py-8">
      <h2 className="font-display text-3xl font-bold leading-tight">Calendario</h2>
      <div className="fixture-card mt-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercasest text-primary">Próximo partido</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex flex-col items-center gap-2"><Crest size={44} /><span className="text-sm font-semibold">CD Lugo</span></div>
          <div className="text-center"><p className="font-display text-2xl font-semibold text-muted-foreground">VS</p><p className="text-xs text-muted-foreground">Dom 2 nov · 18:00</p></div>
          <div className="flex flex-col items-center gap-2"><div className="flex h-[50px] w-11 items-center justify-center rounded-lg bg-muted font-display text-xl">CUL</div><span className="text-sm font-semibold">Cultural</span></div>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">Estadio Anxo Carro</p>
      </div>
      <h3 className="mb-3 mt-8 text-sm font-semibold uppercasest text-muted-foreground">Últimos resultados</h3>
      <ul className="flex flex-col gap-2">
        {past.map((m, i) => {
          const w = m.gf > m.ga ? "V" : m.gf === m.ga ? "E" : "D";
          const badge = w === "V" ? "bg-win-soft text-win" : w === "E" ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary";
          const [l, v] = m.home ? ["CD Lugo", m.rival] : [m.rival, "CD Lugo"];
          const [gl, gv] = m.home ? [m.gf, m.ga] : [m.ga, m.gf];
          const Where = m.home ? Home : Plane;
          return (
            <li key={m.date} style={{ animationDelay: `${i * 70}ms` }} className="result-row animate-screen-in flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badge}`}>{w}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${m.home ? "font-bold" : ""}`}>{l}</p>
                <p className={`truncate text-sm ${!m.home ? "font-bold" : ""}`}>{v}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Where className="h-3 w-3" />{m.home ? "En casa" : "Visitante"} · {m.date}</p>
              </div>
              <div className="flex flex-col items-end font-display text-lg font-semibold tabular-nums leading-6"><span>{gl}</span><span>{gv}</span></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function ModeView({ secs }: { secs: number }) {
  const pct = secs / SESSION_LIMIT_SECONDS;
  const R = 120, C = 2 * Math.PI * R;
  const m = Math.floor(secs / 60);
  return (
    <div className="mode-screen flex flex-col items-center px-7 py-9 text-center">
      <p className="live-status text-xs font-semibold text-primary">● En directo · CD Lugo 1 - 0 Cultural</p>
      <h2 className="mt-5 font-display text-3xl font-bold leading-tight">Modo Anxo Carro</h2>
      <div className="timer-ring relative mt-9 aspect-square w-full max-w-[280px]">
        <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90">
          <circle cx="140" cy="140" r={R} stroke="var(--muted)" strokeWidth="6" fill="none" />
          <circle cx="140" cy="140" r={R} stroke="var(--primary)" strokeWidth="6" fill="none" strokeLinecap="butt" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className="transition-all duration-1000 motion-reduce:transition-none" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="ball-center relative flex h-32 w-32 items-center justify-center rounded-full bg-card" role="img" aria-label="Balón de fútbol clásico">
            <Ball className="h-20 w-20" />
          </div>
          <p className="mt-4 font-display text-xl font-semibold tabular-nums">{m}'</p>
        </div>
      </div>
      <div className="elapsed-panel mt-7 w-full border-t border-border py-7">
        <p className="text-xs uppercasest text-muted-foreground">Tiempo transcurrido</p>
        <p className="elapsed-digits mt-3 font-display text-5xl font-semibold tabular-nums text-foreground" role="timer" aria-label="Tiempo transcurrido">{fmt(secs)}</p>
        <p className="session-status mt-4 text-xs text-muted-foreground">{secs === SESSION_LIMIT_SECONDS ? "Sesión finalizada" : "Sesión en curso"}</p>
      </div>
    </div>
  );
}

function ProfileView({ user, setUser }: UserProps) {
  const [edit, setEdit] = useState<null | "name" | "email" | "phone" | "member">(null);
  const rows: { k: "name" | "email" | "phone" | "member"; l: string; icon: typeof Mail }[] = [
    { k: "name", l: "Nombre completo", icon: User },
    { k: "email", l: "Correo electrónico", icon: Mail },
    { k: "phone", l: "Teléfono móvil", icon: Phone },
    { k: "member", l: "Número de socio", icon: IdCard },
  ];
  return (
    <div className="content-screen px-7 py-8">
      <div className="flex items-center gap-4">
        <div className="profile-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-xl font-semibold text-primary">{initials(user.name)}</div>
        <div className="min-w-0"><h2 className="break-words font-display text-2xl font-bold leading-tight">{shortName(user.name)}</h2><p className="text-sm text-muted-foreground">Socio nº {user.member || "—"}</p></div>
      </div>
      <div className="membership-card mt-8 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between"><p className="text-xs uppercasest text-muted-foreground">Estado de socio</p><span className="rounded-md bg-win-soft px-3 py-1 text-xs font-semibold text-win">ACTIVO</span></div>
        <p className="mt-4 font-display text-lg font-semibold">Temporada 2026/27</p>
      </div>
      <ul className="profile-details mt-7 divide-y divide-border">
        {rows.map(({ k, l, icon: Icon }) => (
          <li key={k} className="py-5">
            <Button variant="ghost" aria-expanded={edit === k} onClick={() => setEdit(edit === k ? null : k)} className="profile-row flex w-full items-center gap-3 text-left">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{l}</p><p className="truncate">{user[k] || "—"}</p></div>
              <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${edit === k ? "rotate-90" : ""}`} />
            </Button>
            <div className={`grid transition-all duration-300 ease-out ${edit === k ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <input aria-label={l} value={user[k]} onChange={(e) => setUser({ ...user, [k]: e.target.value })} placeholder={l} className="w-full rounded-xl border border-input bg-transparent px-4 py-3 outline-none focus:border-primary" />
              </div>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 py-5">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1">Notificaciones</span>
          <Button variant="ghost" role="switch" aria-checked={user.notif} aria-label="Notificaciones" onClick={() => setUser({ ...user, notif: !user.notif })} className={`notification-switch relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${user.notif ? "bg-win" : "bg-muted"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-switch-thumb shadow-sm transition-all duration-300 ${user.notif ? "left-6" : "left-1"}`} />
          </Button>
        </li>
      </ul>
    </div>
  );
}
