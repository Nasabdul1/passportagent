import type { Metadata } from "next";
import "./globals.css";
import {Providers} from "@/components/Providers";
import {Navbar} from "@/components/Navbar";
export const metadata:Metadata={title:"PASSPORT — Identity for autonomous agents",icons:{icon:"/passport-badge.png",apple:"/passport-badge.png"},description:"Issue, manage, and verify agent passports on Robinhood Chain mainnet."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Providers><a className="skip-link" href="#main">Skip to content</a><Navbar/><main id="main">{children}</main><footer className="site-footer"><a href="/" className="app-brand"><img className="brand-badge" src="/passport-badge.png" width="56" height="56" alt=""/> PASSPORT</a><span>Identity. Authority. Boundaries. Proof.</span><a href="/docs">Developer documentation</a><a href="https://x.com/passport_ai" target="_blank" rel="noopener noreferrer" aria-label="Passport on X: @passport_ai">X · @passport_ai ↗</a></footer></Providers></body></html>}

