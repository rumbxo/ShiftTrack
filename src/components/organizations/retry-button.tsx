"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryWorkspaceButton() {
  return <Button className="auth-submit" onClick={() => window.location.reload()}>Try again<RefreshCw size={16} /></Button>;
}
