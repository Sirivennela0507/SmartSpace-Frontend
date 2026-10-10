import { useEffect, useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:8080/api/spaces';

function App() {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(API_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not load spaces.');
        }
        return response.json();
      })
      .then((data) => {
        setSpaces(data);
        setLoading(false);
      })
      .catch(() => {
        setError(
          'Could not connect to the backend. Make sure Spring Boot is running.'
        );
        setLoading(false);
      });
  }, []);

  return (
    <div className="app">
      <nav className="navbar">
        <a className="brand" href="#home">SmartSpace</a>
        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#spaces">Spaces</a>
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-content">
          <span className="hero-label">YOUR SPACE, YOUR WAY</span>
          <h1>Find Your Perfect Space</h1>
          <p>
            Discover comfortable spaces for studying, meetings,
            and productive work.
          </p>
          <a className="explore-btn" href="#spaces">
            Explore Spaces →
          </a>
        </div>

        <div className="hero-visual">
          <div className="visual-card">
            <div className="visual-icon">🏡</div>
            <h3>A better place to focus.</h3>
            <p>Find a space that works for you.</p>
            <strong>Study · Meet · Create</strong>
          </div>
        </div>
      </section>

      <section className="spaces" id="spaces">
        <span className="section-label">EXPLORE</span>
        <h2>Spaces made for you</h2>
        <p className="section-description">
          Explore the spaces available on SmartSpace.
        </p>

        {loading && <p>Loading spaces from the database...</p>}

        {error && <p role="alert">{error}</p>}

        {!loading && !error && spaces.length === 0 && (
          <p>No spaces found in the database yet.</p>
        )}

        <div className="space-grid">
          {spaces.map((space) => (
            <article className="space-card" key={space.id}>
              <div className="card-icon">🏢</div>
              <h3>{space.title}</h3>
              <p>{space.description}</p>
              <p><strong>Location:</strong> {space.location}</p>
              <p className="space-price">
                ₹{Number(space.price).toLocaleString('en-IN')}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer>
        © 2026 SmartSpace. All rights reserved.
      </footer>
    </div>
  );
}

export default App;