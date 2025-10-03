import React from "react"

import styles from "./Button.module.css"

// eslint-disable-next-line functional/type-declaration-immutability
interface ButtonProps extends Readonly<React.ButtonHTMLAttributes<HTMLButtonElement>> {
  readonly variant?: "primary" | "secondary"
  readonly size?: "small" | "medium" | "large"
  readonly children: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "medium",
  className,
  children,
  ...props
}) => {
  const buttonClass = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ")

  return (
    <button className={buttonClass} {...props}>
      {children}
    </button>
  )
}
