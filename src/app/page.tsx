"use client";

import { Plus } from "lucide-react";
import { useEffect } from "react";
import { CharacterStage } from "@/components/viewer/CharacterStage";
import { useViewer } from "@/components/viewer/viewerStore";
import { Library } from "@/components/Library";
import { LinkButton } from "@/components/ui";
import { useSampleCharacterUrl } from "@/lib/client/sample";

export default function Home() {
  const url = useSampleCharacterUrl();
  const set = useViewer((s) => s.set);
  useEffect(() => {
    set({ clip: "waving", loop: true, sequence: null, lighting: "studio", background: "gradient", autoRotate: false });
  }, [set]);

  return (
    <div className="space-y-14">
      <section className="grid items-center gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="order-2 lg:order-1">
          <h1 className="font-display text-[44px] font-extrabold leading-[0.98] sm:text-6xl xl:text-7xl" style={{ fontVariationSettings: '"wdth" 85' }}>
            Bring Yourself to Life
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg text-mist">Transform your photographs into personalised 3D characters. Create, customise and animate your digital identity.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/create" variant="primary" size="lg">
              <Plus className="size-4" /> Create New Character
            </LinkButton>
            <LinkButton href="/characters" size="lg">
              Explore My Characters
            </LinkButton>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
            {[
              ["Up to 6", "camera angles"],
              ["26", "ready-made animations"],
              ["GLB, OBJ, MP4", "export formats"],
            ].map(([a, b]) => (
              <div key={b}>
                <dt className="font-display text-xl font-semibold">{a}</dt>
                <dd className="text-mist">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="order-1 lg:order-2">
          <CharacterStage url={url} className="h-[56vh] min-h-[380px] lg:h-[70vh]" interactive />
          <figcaption className="mt-2 text-[13px] text-mist">A sample character built in your browser by the demo generator. Drag to rotate.</figcaption>
        </figure>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Recent characters</h2>
          <LinkButton href="/characters" variant="ghost" size="sm">
            View all
          </LinkButton>
        </div>
        <Library limit={4} controls={false} />
      </section>
    </div>
  );
}
