"use client";

import { Plus } from "lucide-react";
import { Library } from "@/components/Library";
import { LinkButton } from "@/components/ui";

export default function CharactersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">My Characters</h1>
          <p className="mt-1 text-mist">Private to you. Nothing here is shared unless you export it.</p>
        </div>
        <LinkButton href="/create" variant="primary">
          <Plus className="size-4" /> New character
        </LinkButton>
      </div>
      <Library />
    </div>
  );
}
