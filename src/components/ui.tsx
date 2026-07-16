import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

type PageHeaderProps = {
  titleId: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ action, description, title, titleId }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      <div>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={["ui-card", className].filter(Boolean).join(" ")} {...props} />;
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "danger";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", ...props },
  ref,
) {
  return (
    <button
      className={["ui-button", `ui-button-${variant}`, className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  );
});
