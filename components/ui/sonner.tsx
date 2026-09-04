"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Global toast theme.
 *
 * The app is light-only (`color-scheme: light`, no ThemeProvider). Pinning
 * Sonner to `theme="light"` prevents OS dark mode from applying Sonner's
 * hardcoded light description/close-button colors onto our cream popover
 * toasts. `!important` utilities beat Sonner's `[data-description]` /
 * `[data-close-button]` attribute CSS so every variant stays readable.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
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
          title:
            "font-heading !text-sm font-medium leading-snug !text-popover-foreground",
          // Beat Sonner's hardcoded [data-description] color (#3f3f3f / #e8e8e8).
          description: "!text-sm !leading-snug !text-muted-foreground",
          closeButton:
            "!rounded-md !border !border-border !bg-background !text-foreground opacity-100 transition-colors hover:!bg-muted hover:!text-foreground",
          success: "!border-success/25 !bg-popover !text-popover-foreground",
          error: "!border-destructive/25 !bg-popover !text-popover-foreground",
          warning: "!border-primary/25 !bg-popover !text-popover-foreground",
          info: "!border-border !bg-popover !text-popover-foreground",
          loading: "!bg-popover !text-popover-foreground",
          default: "!bg-popover !text-popover-foreground",
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
