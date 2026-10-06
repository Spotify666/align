"use client";

import dynamic from "next/dynamic";
import { Logo } from "./logo";

/** The 3D mark, loaded after the page; the flat mark stands in until it is ready. */
export const Logo3D = dynamic(() => import("./logo-3d"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-[#fbfaf7]">
      <Logo size={200} />
    </div>
  ),
});
