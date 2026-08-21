"use client";
import Link from"next/link";import{useEffect,useState}from"react";
type Workspace={id:string;name:string;role:string;current:boolean};
export function WorkspaceControl({name,role}:{name:string;role:string}){const[items,setItems]=useState<Workspace[]|null>(null);useEffect(()=>{let active=true;fetch("/api/workspaces/selectable",{cache:"no-store"}).then(response=>response.ok?response.json():null).then(payload=>{if(active&&payload?.workspaces)setItems(payload.workspaces)});return()=>{active=false}},[]);return <div className="admin-workspace"><b>{name}</b><span>{role}</span>{items&&items.length>1?<Link href="/workspace/switch">Switch workspace</Link>:<small>{items?.length===1?"Your workspace":"Current workspace"}</small>}</div>}
