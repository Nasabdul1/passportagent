"use client";
import {usePathname} from 'next/navigation';

import {ConnectButton} from './ConnectButton';
const links=[['/dashboard','Dashboard'],['/agents','Agent Studio'],['/trade','Trade'],['/market','Market'],['/validate','Launch check'],['/explore','Registry'],['/mint','Issue'],['/migrate','Upgrade'],['/verify','Verify'],['/docs','Docs']];
export function Navbar(){const pathname=usePathname();return <header className="app-header"><div className="app-header-top"><a href="/" className="app-brand"><img className="brand-badge" src="/passport-badge.png" width="56" height="56" alt=""/> PASSPORT</a><div className="flex flex-wrap items-center gap-3"><span className="network-select">Mainnet · 4663</span><ConnectButton/></div></div><nav aria-label="Main navigation" className="app-nav">{links.map(([href,label])=><a key={href} href={href} aria-current={pathname?.startsWith(href)?'page':undefined}>{label}</a>)}</nav></header>}

