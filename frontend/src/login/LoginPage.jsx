import AuthShell from './AuthShell'
import LoginForm from './LoginForm'

export default function LoginPage({
  errorMessage,
  infoMessage,
  isSubmitting,
  onSubmit,
  onForgotPassword,
  onGoogleSignIn,
}) {
  return (
    <AuthShell>
      <LoginForm
        errorMessage={errorMessage}
        infoMessage={infoMessage}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onForgotPassword={onForgotPassword}
        onGoogleSignIn={onGoogleSignIn}
      />
    </AuthShell>
  )
}
