"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
type Workspace={id:string;name:string;role:string;current:boolean};
export function WorkspaceControl({name,role,accountAction}:{name:string;role:string;accountAction?:ReactNode}) {
  const[items,setItems]=useState<Workspace[]|null>(null);
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{let active=true;fetch("/api/workspaces/selectable",{cache:"no-store"}).then(response=>response.ok?response.json():null).then(payload=>{if(active&&payload?.workspaces)setItems(payload.workspaces)});return()=>{active=false}},[]);
  const content=<><div className="admin-workspace__identity"><b>{name}</b><span>{role}</span></div>{items&&items.length>1?<Link href="/workspace/switch">Switch workspace</Link>:<small>{items?.length===1?"Your workspace":"Current workspace"}</small>}{accountAction}</>;
  if (!accountAction) return <div className="admin-workspace">{content}</div>;
  return <details ref={menu} className="admin-workspace admin-workspace-menu" onKeyDown={event=>{if(event.key!=="Escape"||!menu.current?.open)return;event.preventDefault();menu.current.open=false;menu.current.querySelector<HTMLElement>("summary")?.focus();}}><summary><span><b>{name}</b><small>{role}</small></span><span aria-hidden="true">⌄</span></summary><div className="admin-workspace-menu__panel">{content}</div></details>;
}
