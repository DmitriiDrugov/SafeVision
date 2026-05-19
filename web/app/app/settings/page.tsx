import Link from "next/link";
import { Settings2 } from "lucide-react";

export default function SettingsPage(): React.ReactElement {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-ink-400">
          A dedicated settings surface is not wired up yet. Configuration today
          lives in the pages below.
        </p>
      </header>

      <div className="surface rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-0.5 h-5 w-5 text-ink-400" />
          <div className="space-y-3 text-sm text-ink-200">
            <p>
              Use{" "}
              <Link href="/configure" className="text-accent hover:underline">
                Configure
              </Link>{" "}
              to draft detection rules from natural language, or{" "}
              <Link href="/rules" className="text-accent hover:underline">
                Rules
              </Link>{" "}
              to edit them directly.
            </p>
            <p>
              Camera pairing and zones are managed per-camera from the{" "}
              <Link href="/cameras" className="text-accent hover:underline">
                Cameras
              </Link>{" "}
              list.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
