/** React access to the IDE store and actions. */
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { Ide, IdeActions, IdeState } from "./store/ide.ts";

export const IdeContext = createContext<Ide | null>(null);

function useIdeContext(): Ide {
  const ide = useContext(IdeContext);
  if (!ide) throw new Error("IdeContext is missing");
  return ide;
}

/** The whole Ide, for components that subscribe outside React (the Monaco panels). */
export function useIdeInstance(): Ide {
  return useIdeContext();
}

export function useIde<T>(selector: (s: IdeState) => T): T {
  return useStore(useIdeContext().store, selector);
}

export function useActions(): IdeActions {
  return useIdeContext().actions;
}
