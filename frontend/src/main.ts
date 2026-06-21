import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = `
  <section class="shell">
    <p class="eyebrow">seamarg</p>
    <h1>Frontend workspace is ready.</h1>
    <p>Build the TypeScript app here and deploy it independently from the backend and Lambda functions.</p>
  </section>
`;
