export default function LoadingSkeleton({ message }) {
  return (
    <div class="skeleton">
      <div class="skeleton__line" style={{ width: '90%' }} />
      <div class="skeleton__line" style={{ width: '75%' }} />
      <div class="skeleton__line" style={{ width: '60%' }} />
      <p class="skeleton__msg">{message}</p>
    </div>
  );
}
