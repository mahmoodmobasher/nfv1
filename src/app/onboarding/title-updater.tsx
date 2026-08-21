"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
const titles: Record<string, string> = { "/": "Connected B2B Sales & Delivery CRM", "/select-plan": "Choose a CRM plan", "/register": "Create your NexaFlow account", "/verify-email": "Check your email", "/login": "Welcome back", "/forgot-password": "Reset your password", "/reset-password": "Choose a new password", "/workspace/create": "Create your workspace", "/workspace/ready": "Your workspace is ready", "/crm": "CRM overview", "/invite": "Invite your team", "/workspace/settings": "Workspace settings", "/crm/leads/new": "Add your first lead" };
export function TitleUpdater() { const path = usePathname(); useEffect(() => { const title = `${titles[path] || "NexaFlow"} | NexaFlow`; if (document.title !== title) document.title = title; }, [path]); return null; }
