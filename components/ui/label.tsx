"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function RequiredAsterisk({ className }: { className?: string }) {
  return (
    <>
      <span className="sr-only">required</span>
      <span
        aria-hidden="true"
        className={cn(
          "font-heading text-[0.65em] font-semibold leading-none text-[#c0392b] relative -top-1",
          className,
        )}
      >
        *
      </span>
    </>
  )
}

function Label({
  className,
  children,
  required = false,
  ...props
}: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {required ? (
        <span className="inline-flex items-baseline gap-0.5">
          {children}
          <RequiredAsterisk />
        </span>
      ) : (
        children
      )}
    </label>
  )
}

export { Label, RequiredAsterisk }
