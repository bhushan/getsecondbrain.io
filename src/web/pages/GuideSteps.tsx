import type { GuideStep } from "../connectGuides";
import { CopyButton } from "./CopyButton";

/** A numbered stepper; steps with something to paste get a code box with its own copy button. */
export function GuideSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="stepper">
      {steps.map((step, index) => (
        <li key={index}>
          <span className="stepper-num" aria-hidden="true">
            {index + 1}
          </span>
          <div className="stepper-body">
            <p>{step.text}</p>
            {step.code && (
              <div className="code-box">
                <div className="code-head">
                  <span>{step.codeLabel ?? "Copy this"}</span>
                  <CopyButton text={step.code} className="ghost btn-sm" />
                </div>
                {/* One-line snippets wrap; multi-line ones keep their shape and scroll inside the box. */}
                {step.code.includes("\n") ? <pre>{step.code}</pre> : <code>{step.code}</code>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
