import { CLIENTS_DATA } from '../data/mockData'

export default function ClientsView() {
  return (
    <>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Organisation</th><th>Country / Industry</th><th>Deployment</th><th>Primary contact (approver)</th><th>Projects</th><th>Portal access</th>
            </tr>
          </thead>
          <tbody>
            {CLIENTS_DATA.map((c, i) => (
              <tr key={i}>
                <td><strong>{c.name}</strong></td>
                <td>{c.country}<br /><span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{c.industry}</span></td>
                <td style={{ maxWidth: '220px' }}>{c.deploy}</td>
                <td>{c.contact}</td>
                <td>{c.projects}</td>
                <td>
                  {c.access === 'Suspended'
                    ? <span className="badge red"><span className="dot" />Suspended</span>
                    : <span className="badge gray"><span className="dot" />{c.access}</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '14px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
        Enterprise clients get a dedicated GCP project provisioned by Xccelera — client data never leaves it. Xccelera retains infra admin access; the client has read visibility.
      </p>
    </>
  )
}
