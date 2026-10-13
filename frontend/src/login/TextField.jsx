export default function TextField({ id, label, icon, labelAction, trailing, ...inputProps }) {
  return (
    <div className="field">
      <div className="field__label-row">
        <label className="field__label" htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className="field__control">
        <span className="field__icon">{icon}</span>
        <input id={id} className="field__input" {...inputProps} />
        {trailing}
      </div>
    </div>
  )
}
