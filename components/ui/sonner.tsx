"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group font-sans"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-muted-foreground" />,
        warning: <TriangleAlertIcon className="size-4 text-primary" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-xl)",
          "--success-bg": "var(--popover)",
          "--success-border": "color-mix(in srgb, var(--success) 22%, var(--border))",
          "--success-text": "var(--popover-foreground)",
          "--error-bg": "var(--popover)",
          "--error-border": "color-mix(in oklch, var(--destructive) 25%, var(--border))",
          "--error-text": "var(--popover-foreground)",
          "--info-bg": "var(--popover)",
          "--info-border": "var(--border)",
          "--info-text": "var(--popover-foreground)",
          "--warning-bg": "var(--popover)",
          "--warning-border": "color-mix(in oklch, var(--primary) 25%, var(--border))",
          "--warning-text": "var(--popover-foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-xl !border !border-border !bg-popover !font-sans !text-popover-foreground",
          title: "font-heading text-sm font-medium leading-snug",
          description: "text-sm text-muted-foreground",
          closeButton:
            "!rounded-md !border !border-border !bg-background/80 !text-muted-foreground transition-colors hover:!bg-muted/50 hover:!text-foreground",
          success: "!border-success/25 !bg-popover",
          error: "!border-destructive/25 !bg-popover",
          warning: "!border-primary/25 !bg-popover",
          info: "!border-border !bg-popover",
          actionButton:
            "rounded-lg bg-primary font-heading text-sm text-primary-foreground hover:bg-primary-hover",
          cancelButton:
            "rounded-lg bg-muted font-heading text-sm text-muted-foreground hover:bg-muted/80",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
