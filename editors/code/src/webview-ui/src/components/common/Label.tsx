import React from "react"
import styles from "./Label.module.css"

// eslint-disable-next-line functional/type-declaration-immutability
interface LabelProps extends Readonly<React.LabelHTMLAttributes<HTMLLabelElement>> {
  readonly variant?: "default" | "description"
  readonly children: React.ReactNode
}

export const Label: React.FC<LabelProps> = ({
  variant = "default",
  className,
  children,
  ...props
}) => {
  const labelClass = [styles.label, styles[variant], className].filter(Boolean).join(" ")

  return (
    <label className={labelClass} {...props}>
      {children}
    </label>
  )
}
