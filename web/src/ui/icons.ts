// Chunky sticker-style icons: colored shapes with a thick ink outline.
// Every icon is drawn on a 32x32 grid.

const INK = '#1c1442';
const S = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;

/** A line drawn twice (ink underneath, color on top) so it reads as an outlined stroke. */
function line(d: string, color = '#fff', w = 4.2): string {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 3.4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function starPath(cx: number, cy: number, ro: number, ri: number): string {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? ri : ro;
    d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }
  return d + 'Z';
}

function gearPath(cx: number, cy: number, ro: number, ri: number, teeth: number): string {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    const a = k * step - Math.PI / 2;
    const pts = [
      [a - step * 0.5, ri],
      [a - step * 0.22, ri],
      [a - step * 0.15, ro],
      [a + step * 0.15, ro],
      [a + step * 0.22, ri],
    ];
    for (const [ang, r] of pts) d += `${d ? 'L' : 'M'}${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;
  }
  return d + 'Z';
}

/** A shiny ball, used by several icons. */
function ball(cx: number, cy: number, r: number, color: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" ${S}/><ellipse cx="${cx - r * 0.32}" cy="${cy - r * 0.38}" rx="${r * 0.38}" ry="${r * 0.22}" fill="#fff" fill-opacity=".75" transform="rotate(-30 ${cx - r * 0.32} ${cy - r * 0.38})"/>`;
}

export const STAR_PATH = starPath(16, 16.8, 13.6, 6.4);

const ICONS = {
  play: `<path d="M11 6.8v18.4c0 1.2 1.3 1.9 2.3 1.3l14.2-9.2c.9-.6.9-1.9 0-2.5L13.3 5.6c-1-.7-2.3 0-2.3 1.2z" fill="#fff" ${S}/>`,
  bolt: `<path d="M19.4 2.8 6.2 18.4h8.6l-2.4 10.8 13.4-16.2h-8.6l2.2-10.2z" fill="#ffd43b" ${S}/><path d="M17.2 6.6 11 14" stroke="#fff6bf" stroke-width="2" stroke-linecap="round"/>`,
  users: `<circle cx="21.5" cy="10.5" r="5" fill="#4dabf7" ${S}/><path d="M13.5 26.5c0-5.2 3.6-8.6 8-8.6s8 3.4 8 8.6z" fill="#4dabf7" ${S}/><circle cx="11.5" cy="12.8" r="5.6" fill="#ff6b9d" ${S}/><path d="M2.6 28.6c0-5.6 4-9.4 8.9-9.4s8.9 3.8 8.9 9.4z" fill="#ff6b9d" ${S}/>`,
  gear: `<path d="${gearPath(16, 16, 14, 10.6, 8)}" fill="#c9d1f2" ${S}/><circle cx="16" cy="16" r="4.6" fill="#7c86c9" ${S}/>`,
  help: `<circle cx="16" cy="16" r="13.4" fill="#4dabf7" ${S}/>${line('M12 12.6a4.1 4.1 0 1 1 5.9 3.6c-1.3.7-1.9 1.5-1.9 3', '#fff', 3.6)}<circle cx="16" cy="24" r="2.5" fill="#fff" ${S}/>`,
  back: line('M18.5 7.5 10 16l8.5 8.5M10.6 16H23', '#fff', 4.4),
  next: line('M13.5 7.5 22 16l-8.5 8.5M21.4 16H9', '#fff', 4.4),
  close: line('M9.5 9.5l13 13M22.5 9.5l-13 13', '#fff', 4.4),
  plus: line('M16 8v16M8 16h16', '#fff', 4.6),
  pause: `<rect x="8.5" y="6.5" width="5.6" height="19" rx="2" fill="#fff" ${S}/><rect x="17.9" y="6.5" width="5.6" height="19" rx="2" fill="#fff" ${S}/>`,
  lock: `<path d="M10.5 14.5v-3.8a5.5 5.5 0 0 1 11 0v3.8" fill="none" stroke="${INK}" stroke-width="6.2" stroke-linecap="round"/><path d="M10.5 14.5v-3.8a5.5 5.5 0 0 1 11 0v3.8" fill="none" stroke="#c9cfe3" stroke-width="2.6" stroke-linecap="round"/><rect x="6.5" y="13.5" width="19" height="15" rx="3.6" fill="#ffc53d" ${S}/><circle cx="16" cy="20" r="2.2" fill="${INK}"/><path d="M16 21v3.4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  star: `<path d="${STAR_PATH}" fill="#ffd43b" ${S}/><path d="M11.5 12.6 9.6 12.4" stroke="#fff6bf" stroke-width="2" stroke-linecap="round"/>`,
  trophy: `<path d="M9.5 6.5h13v6.6a6.5 6.5 0 0 1-13 0z" fill="#ffd43b" ${S}/><path d="M9.5 9H5.8c0 3.4 1.6 5.4 4.5 5.8M22.5 9h3.7c0 3.4-1.6 5.4-4.5 5.8" fill="none" ${S}/><path d="M14 19.4h4l.8 4.4h-5.6z" fill="#ffb703" ${S}/><rect x="9.5" y="23.8" width="13" height="4.4" rx="1.6" fill="#ff922b" ${S}/><path d="M13 8.8v4" stroke="#fff6bf" stroke-width="2" stroke-linecap="round"/>`,
  crown: `<path d="M4.5 11.5 10 17l6-9 6 9 5.5-5.5-2.4 14H6.9z" fill="#ffd43b" ${S}/><circle cx="16" cy="20.5" r="2" fill="#ff6b9d" ${S}/><path d="M7.5 22.4h17" stroke="${INK}" stroke-width="2.2"/>`,
  wifi: `${line('M4.8 12.6a16 16 0 0 1 22.4 0', '#fff', 3.6)}${line('M9 17a10 10 0 0 1 14 0', '#fff', 3.6)}<circle cx="16" cy="23.4" r="3" fill="#fff" ${S}/>`,
  robot: `<path d="M16 3.6v4" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>${ball(16, 3.8, 2.4, '#ff6b9d')}<rect x="5.5" y="8" width="21" height="17" rx="5.5" fill="#a5d8ff" ${S}/><circle cx="12" cy="15.4" r="2.6" fill="${INK}"/><circle cx="20" cy="15.4" r="2.6" fill="${INK}"/><circle cx="12.8" cy="14.6" r=".9" fill="#fff"/><circle cx="20.8" cy="14.6" r=".9" fill="#fff"/><path d="M12.5 20.6h7" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M3.5 14v5M28.5 14v5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M10 28h12" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  music: `<path d="M12 23.6V7.4l14-3v15.4" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><path d="M12 23.6V7.4l14-3v15.4" fill="none" stroke="#b197fc" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="8.4" cy="24" rx="4.6" ry="3.8" fill="#b197fc" ${S}/><ellipse cx="22.4" cy="20.2" rx="4.6" ry="3.8" fill="#b197fc" ${S}/>`,
  sound: `<path d="M5 12.4h4.6l6.4-5.6v18.4l-6.4-5.6H5z" fill="#fff" ${S}/>${line('M20.6 11.6a6 6 0 0 1 0 8.8', '#fff', 3)}${line('M24 8.2a11 11 0 0 1 0 15.6', '#fff', 3)}`,
  vibrate: `<rect x="10" y="4.5" width="12" height="23" rx="3" fill="#74c0fc" ${S}/><path d="M14 23.6h4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>${line('M5.4 10.6 3.4 13l2 2.4-2 2.4 2 2.4', '#fff', 2)}${line('M26.6 10.6l2 2.4-2 2.4 2 2.4-2 2.4', '#fff', 2)}`,
  aim: `<circle cx="16" cy="16" r="10.4" fill="none" stroke="${INK}" stroke-width="6.4"/><circle cx="16" cy="16" r="10.4" fill="none" stroke="#ff6b6b" stroke-width="3"/>${line('M16 2.6v7M16 22.4v7M2.6 16h7M22.4 16h7', '#fff', 2.6)}<circle cx="16" cy="16" r="2.8" fill="#ff6b6b" ${S}/>`,
  shapes: `<path d="M9.8 4.8l6.6 11.4H3.2z" fill="#ffd43b" ${S}/><rect x="17.4" y="5.4" width="10.4" height="10.4" rx="1.6" fill="#4dabf7" ${S}/><path d="M16 28.2c-6.8-4.2-8.8-7.6-6.4-10.2 1.6-1.6 4.4-1.2 6.4 1.2 2-2.4 4.8-2.8 6.4-1.2 2.4 2.6.4 6-6.4 10.2z" fill="#ff6b6b" ${S}/>`,
  home: `<path d="M4.5 15.4 16 5l11.5 10.4" fill="none" stroke="${INK}" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 14v12.6c0 .9.7 1.6 1.6 1.6h13.8c.9 0 1.6-.7 1.6-1.6V14L16 6.6z" fill="#ffa94d" ${S}/><path d="M4.5 15.4 16 5l11.5 10.4" fill="none" stroke="#ff6b6b" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="13" y="19" width="6" height="9.2" rx="1.4" fill="#fff" ${S}/>`,
  restart: `${line('M24.6 18.4A9 9 0 1 1 21.4 9', '#fff', 4.2)}<path d="M18.4 3.6l7.8 1.8-3.4 7z" fill="#fff" ${S}/>`,
  map: `<path d="M3.5 8 11 5l10 3 7.5-3v19l-7.5 3-10-3-7.5 3z" fill="#8ce99a" ${S}/><path d="M11 5v19M21 8v19" stroke="${INK}" stroke-width="2.2"/><path d="M6.5 16.5c2.5-2 4.5 2 7 0s4-1 6 .8" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2 2.4" stroke-linecap="round"/><path d="M24 10.4c0 2.6-3.4 6-3.4 6s-3.4-3.4-3.4-6a3.4 3.4 0 0 1 6.8 0z" fill="#ff6b6b" ${S}/>`,
  bomb: `<path d="M19.6 8.6c1.6-2.4 3.6-3.4 6.2-2.4" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M19.6 8.6c1.6-2.4 3.6-3.4 6.2-2.4" fill="none" stroke="#e9c46a" stroke-width="2" stroke-linecap="round"/><rect x="15.2" y="7.6" width="6" height="4.4" rx="1" transform="rotate(35 18.2 9.8)" fill="#6c7393" ${S}/><circle cx="13.6" cy="18.6" r="10" fill="#363b52" ${S}/><ellipse cx="9.6" cy="14.6" rx="3" ry="1.8" fill="#fff" fill-opacity=".55" transform="rotate(-35 9.6 14.6)"/><path d="${starPath(27.2, 5, 4.2, 1.8)}" fill="#ffd43b" ${S}/>`,
  rainbow: `${line('M4.4 24a11.6 11.6 0 0 1 23.2 0', '#ff6b6b', 3.2)}${line('M9 24a7 7 0 0 1 14 0', '#ffd43b', 3.2)}${line('M13.2 24a2.8 2.8 0 0 1 5.6 0', '#4dabf7', 3)}`,
  radar: `<circle cx="16" cy="16" r="12.6" fill="#a5d8ff" ${S}/><circle cx="16" cy="16" r="7.4" fill="none" stroke="${INK}" stroke-width="1.8" stroke-opacity=".5"/><path d="M16 16 25 7.4" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="21" cy="19.6" r="2.4" fill="#ff6b9d" ${S}/><circle cx="16" cy="16" r="2" fill="${INK}"/>`,
  join: `<path d="M17 5.5h7.2c1 0 1.8.8 1.8 1.8v17.4c0 1-.8 1.8-1.8 1.8H17" fill="#ffd8a8" ${S}/>${line('M5 16h13M13 10.5l5.5 5.5-5.5 5.5', '#fff', 3.8)}`,
  user: `<circle cx="16" cy="11" r="6" fill="#ffd8a8" ${S}/><path d="M5 28.4c0-6.4 4.9-10.4 11-10.4s11 4 11 10.4z" fill="#ff922b" ${S}/>`,
  palette: `${ball(9.4, 11, 5.4, '#ff6b6b')}${ball(22.6, 11, 5.4, '#4dabf7')}${ball(16, 22, 5.4, '#ffd43b')}`,
  drop: `${line('M10.6 3.6v6.4M21.6 3v4.6', '#fff', 2.4)}${ball(10.6, 20.4, 6.2, '#4dabf7')}${ball(21.6, 15.6, 5.6, '#ff6b9d')}`,
  swap: `${line('M8.6 13.4a8 8 0 0 1 13.6-4.2', '#fff', 3.4)}<path d="M24.2 4.6l1 8.2-7.6-2.6z" fill="#fff" ${S}/>${line('M23.4 18.6a8 8 0 0 1-13.6 4.2', '#fff', 3.4)}<path d="M7.8 27.4l-1-8.2 7.6 2.6z" fill="#fff" ${S}/>`,
  bounce: `${line('M5 26.6 11.4 6l8 14.6 7.6-14', '#fff', 2.8)}${ball(26.4, 6.6, 3.6, '#ffd43b')}`,
  stone: `<path d="M6.4 11.4 12.6 5.6l9.2 1.2 5.2 7.6-1.8 9.6-8.6 3.4-9-3.2-2.6-7.6z" fill="#a9b0c4" ${S}/><path d="M12 13.4l4 3 3.6-4.4M16 16.4l-1 6.4" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  ceiling: `<rect x="3.5" y="4" width="25" height="8" rx="2" fill="#a9b0c4" ${S}/><circle cx="8.4" cy="8" r="1.4" fill="${INK}"/><circle cx="23.6" cy="8" r="1.4" fill="${INK}"/>${line('M16 15.4v10.6M11 21.4l5 5 5-5', '#ffd43b', 3.4)}`,
  pop: `${ball(16, 16, 7, '#ff6b9d')}${line('M16 3v3.4M16 25.6V29M3 16h3.4M25.6 16H29M6.8 6.8l2.4 2.4M22.8 22.8l2.4 2.4M25.2 6.8l-2.4 2.4M9.2 22.8l-2.4 2.4', '#ffd43b', 2.2)}`,
  finger: `<path d="M12.4 16.6V6.8a2.6 2.6 0 0 1 5.2 0v7.4l6 1.2c1.9.4 3.1 2.2 2.8 4.1l-1.2 6.4c-.3 1.6-1.7 2.8-3.4 2.8h-6.2c-1.2 0-2.3-.6-2.9-1.6L8 21.6c-.8-1.3-.4-3 .9-3.8 1-.6 2.4-.4 3.2.5z" fill="#ffd8a8" ${S}/>`,
  sparkle: `<path d="M16 2.8c.9 6.4 3.6 10.2 10.6 12.6-7 2.4-9.7 6.2-10.6 12.6-.9-6.4-3.6-10.2-10.6-12.6C12.4 13 15.1 9.2 16 2.8z" fill="#fff6bf" ${S}/>`,
  sad: `${ball(16, 16.5, 13, '#4dabf7')}<circle cx="11.6" cy="16" r="1.9" fill="${INK}"/><circle cx="20.4" cy="16" r="1.9" fill="${INK}"/><path d="M12 23.4q4-3.6 8 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M8.8 12.2l4.2 1.4M23.2 12.2 19 13.6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M22.6 19.4c1.6 1.6 1.6 3.2 0 3.6-1.6-.4-1.6-2 0-3.6z" fill="#a5d8ff" stroke="${INK}" stroke-width="1.4"/>`,
  happy: `${ball(16, 16.5, 13, '#ffd43b')}<path d="M10.2 15.6q1.8-2.4 3.6 0M18.2 15.6q1.8-2.4 3.6 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M11 19.6q5 5.6 10 0z" fill="${INK}"/><circle cx="8.6" cy="19.6" r="1.8" fill="#ff6b9d" fill-opacity=".8"/><circle cx="23.4" cy="19.6" r="1.8" fill="#ff6b9d" fill-opacity=".8"/>`,
  medal: `<path d="M10 3.5h4.4l3 7.4-4.4 2zM22 3.5h-4.4l-3 7.4 4.4 2z" fill="#4dabf7" ${S}/>${ball(16, 19.6, 8.4, '#ffd43b')}<path d="${starPath(16, 20, 4.4, 2)}" fill="#ffb703" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Returns an inline SVG icon. Size it with CSS (it is 1em by default). */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="ico ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

/** Same icon as an SVG string (for markup built as text). */
export function iconSvg(name: IconName, cls = ''): string {
  return `<svg class="ico ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
