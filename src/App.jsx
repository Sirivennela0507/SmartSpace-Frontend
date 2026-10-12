import { useEffect, useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:8080/api/spaces';
const BOOKINGS_URL = 'http://localhost:8080/api/bookings';
const AUTH_URL = 'http://localhost:8080/api/auth';

const categories = ['All', 'Study', 'Meeting', 'Interview'];

function getCategory(space) {
  const title = (space.title || '').toLowerCase();
  if (title.includes('study')) return 'Study';
  if (title.includes('meeting')) return 'Meeting';
  if (title.includes('interview') || title.includes('workspace')) return 'Interview';
  return 'Work';
}

function getIcon(category) {
  if (category === 'Study') return '📚';
  if (category === 'Meeting') return '🤝';
  if (category === 'Interview') return '🎤';
  return '💻';
}

function getPeople(space) {
  const capacity = Number(space.capacity || 1);
  const type = String(space.bookingType || space.booking_type || 'PRIVATE').toUpperCase();
  return `${capacity} ${capacity === 1 ? 'person' : 'people'} · ${type === 'SHARED' ? 'Shared' : 'Private'}`;
}

function formatDate(dateValue) {
  if (!dateValue) return 'Date not available';

  // Parse YYYY-MM-DD as a local calendar date to avoid timezone shifts.
  const parts = String(dateValue).split('-');
  if (parts.length !== 3) return String(dateValue);

  const [year, month, day] = parts.map(Number);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatTime(timeValue) {
  if (!timeValue) return 'Not available';

  const match = String(timeValue).match(/^(\\d{1,2}):(\\d{2})(?::\\d{2})?$/);
  if (!match) return String(timeValue);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return String(timeValue);

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function App() {
  const [spaces, setSpaces] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [showBookings, setShowBookings] = useState(false);

  const [selectedSpace, setSelectedSpace] = useState(null);
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [durationHours, setDurationHours] = useState('1');
  const [memberCount, setMemberCount] = useState('1');
  const [availability, setAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Authentication state for the current browser tab session.
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = sessionStorage.getItem('smartspace_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('smartspace_token') || '');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const localToday = getLocalDateString();

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpaces() {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(API_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('The spaces API did not return a list.');
        setSpaces(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError('Could not load spaces. Check that the backend is running.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadSpaces();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedSpace || !bookingDate || !startTime || !durationHours) {
      setAvailability(null);
      setAvailabilityError('');
      return;
    }

    const controller = new AbortController();
    async function checkAvailability() {
      setAvailabilityLoading(true);
      setAvailabilityError('');
      try {
        const params = new URLSearchParams({
          spaceId: String(selectedSpace.id),
          bookingDate,
          startTime,
          durationHours: String(durationHours),
        });
        const response = await fetch(`${BOOKINGS_URL}/availability?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || `Availability check failed (${response.status}).`);
        setAvailability(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setAvailability(null);
          setAvailabilityError(err.message || 'Could not check availability.');
        }
      } finally {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      }
    }

    checkAvailability();
    return () => controller.abort();
  }, [selectedSpace, bookingDate, startTime, durationHours]);

  async function loadBookings() {
    try {
      setBookingsLoading(true);
      setBookingsError('');
      if (!authToken) {
        setBookings([]);
        setBookingsError('Please log in to view your bookings.');
        return;
      }
      const response = await fetch(BOOKINGS_URL, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('The bookings API did not return a list.');
      setBookings(data);
    } catch {
      setBookingsError('Could not load bookings. Please check that the backend is running.');
    } finally {
      setBookingsLoading(false);
    }
  }

  async function cancelBooking(booking) {
    if (!booking?.id || !authToken) {
      setBookingsError('Please log in again before cancelling a booking.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to cancel booking #${booking.id}?`
    );
    if (!confirmed) return;

    setBookingsError('');
    setCancellingBookingId(booking.id);

    try {
      const response = await fetch(`${BOOKINGS_URL}/${booking.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const responseText = await response.text();
      let data = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { message: responseText };
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.message || `Could not cancel booking (${response.status}).`
        );
      }

      await loadBookings();
    } catch (err) {
      setBookingsError(
        err.message || 'Could not cancel this booking. Please try again.'
      );
    } finally {
      setCancellingBookingId(null);
    }
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode);
    setAuthName('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthMessage('');
    setAuthError('');
    setShowAuth(true);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthMessage('');
    setAuthError('');

    if (!authEmail.trim() || !authPassword) {
      setAuthError('Please enter your email and password.');
      return;
    }
    if (authMode === 'register' && !authName.trim()) {
      setAuthError('Please enter your name.');
      return;
    }
    if (authMode === 'register' && authPassword.length < 8) {
      setAuthError('Password must contain at least 8 characters.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const endpoint = authMode === 'register' ? 'register' : 'login';
      const payload = authMode === 'register'
        ? { name: authName.trim(), email: authEmail.trim(), password: authPassword }
        : { email: authEmail.trim(), password: authPassword };

      const response = await fetch(`${AUTH_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let data = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = responseText;
        }
      }

      if (!response.ok) {
        const message = typeof data === 'string'
          ? data
          : data?.message || `Request failed (${response.status}).`;
        throw new Error(message);
      }

      if (authMode === 'register') {
        setAuthMode('login');
        setAuthPassword('');
        setAuthMessage('Account created! Please log in with your new account.');
      } else {
        if (!data || typeof data.token !== 'string' || !data.token) {
          throw new Error('Login succeeded but the server did not return an authentication token.');
        }
        const userProfile = { id: data.id, name: data.name, email: data.email };
        sessionStorage.setItem('smartspace_token', data.token);
        sessionStorage.setItem('smartspace_user', JSON.stringify(userProfile));
        setAuthToken(data.token);
        setCurrentUser(userProfile);
        setShowAuth(false);
        setAuthPassword('');
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('smartspace_token');
    sessionStorage.removeItem('smartspace_user');
    setAuthToken('');
    setCurrentUser(null);
    setShowBookings(false);
    setAuthMessage('');
    setAuthError('');
  }

  function openMyBookings() {
    if (!authToken) {
      openAuth('login');
      return;
    }
    setShowBookings(true);
    setSelectedSpace(null);
    loadBookings();
  }

  function openBooking(space) {
    setSelectedSpace(space);
    setShowBookings(false);
    setBookingDate('');
    setStartTime('10:00');
    setDurationHours('1');
    setMemberCount('1');
    setAvailability(null);
    setAvailabilityError('');
    setBookingMessage('');
    setBookingError('');
  }

  function closeBooking() {
    if (submitting) return;
    setSelectedSpace(null);
    setBookingMessage('');
    setBookingError('');
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (!selectedSpace) return;

    setBookingMessage('');
    setBookingError('');

    if (!bookingDate || !startTime || !durationHours) {
      setBookingError('Please complete all booking fields.');
      return;
    }

    if (bookingDate < getLocalDateString()) {
      setBookingError('Please choose today or a future date.');
      return;
    }

    const hours = Number(durationHours);
    const members = Number(memberCount);
    const capacity = Number(selectedSpace.capacity || 1);
    if (!Number.isInteger(members) || members < 1 || members > capacity) {
      setBookingError(`Choose between 1 and ${capacity} members for this room.`);
      return;
    }
    if (availability && members > Number(availability.availableSeats)) {
      setBookingError(`Only ${availability.availableSeats} seats are available for that time.`);
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
      setBookingError('Duration must be between 1 and 12 hours.');
      return;
    }

    setSubmitting(true);
    try {
      if (!authToken) {
        throw new Error('Please log in before creating a booking.');
      }
      const response = await fetch(BOOKINGS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          spaceId: selectedSpace.id,
          bookingDate,
          startTime,
          durationHours: hours,
          memberCount: Number(memberCount),
        }),
      });

      const responseText = await response.text();
      if (!response.ok) throw new Error(responseText || `Booking failed (${response.status}).`);

      let savedBooking = null;
      if (responseText) {
        try {
          savedBooking = JSON.parse(responseText);
        } catch {
          throw new Error('The server returned an unexpected response.');
        }
      }

      const total = Number(savedBooking?.totalPrice ?? Number(selectedSpace.price) * hours);
      setBookingMessage(
        `Booking confirmed! Booking ID: ${savedBooking?.id ?? 'Saved'}. Total: ₹${total.toFixed(2)}`
      );
    } catch (err) {
      setBookingError(err.message || 'Could not save the booking. Please check the backend and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredSpaces = activeCategory === 'All'
    ? spaces
    : spaces.filter((space) => getCategory(space) === activeCategory);

  const spaceNames = Object.fromEntries(spaces.map((space) => [space.id, space.title]));

  return (
    <div className="app">
      <nav className="navbar">
        <a href="#home" onClick={() => setShowBookings(false)}><h2>SmartSpace</h2></a>
        <div className="nav-links">
          <a href="#home" onClick={() => setShowBookings(false)}>Home</a>
          <a href="#spaces" onClick={() => setShowBookings(false)}>Spaces</a>
          <a href="#bookings" onClick={(event) => {
            event.preventDefault();
            openMyBookings();
            window.location.hash = 'bookings';
          }}>My Bookings</a>
          <a href="#benefits" onClick={() => setShowBookings(false)}>Benefits</a>
          {currentUser ? (
            <>
              <span style={{ color: '#24324a', fontWeight: 600, fontSize: '0.9rem' }}>
                Hi, {currentUser.name || currentUser.email}
              </span>
              <button type="button" className="booking-cancel" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <button type="button" className="booking-cancel" onClick={() => openAuth('login')}>Log in</button>
              <button type="button" className="explore-btn" onClick={() => openAuth('register')}>Register</button>
            </>
          )}
        </div>
      </nav>

      {showBookings ? (
        <section className="spaces my-bookings-section" id="bookings">
          <span className="section-label">YOUR RESERVATIONS</span>
          <h2>My Bookings</h2>
          <p className="section-description">View the reservations saved in SmartSpace.</p>

          <div className="booking-page-actions">
            <button type="button" className="explore-btn" onClick={loadBookings} disabled={bookingsLoading}>
              {bookingsLoading ? 'Refreshing...' : 'Refresh Bookings'}
            </button>
            <button type="button" className="booking-cancel" onClick={() => {
              setShowBookings(false);
              window.location.hash = 'spaces';
            }}>Back to Spaces</button>
          </div>

          {bookingsLoading && <p className="status-message">Loading your bookings...</p>}

          {!bookingsLoading && bookingsError && (
            <div className="status-message error-message">
              <p>{bookingsError}</p>
              <button type="button" className="explore-btn" onClick={loadBookings}>Try Again</button>
            </div>
          )}

          {!bookingsLoading && !bookingsError && bookings.length === 0 && (
            <div className="empty-bookings">
              <span>📅</span>
              <h3>No bookings yet</h3>
              <p>Your confirmed reservations will appear here.</p>
              <button type="button" className="explore-btn" onClick={() => {
                setShowBookings(false);
                window.location.hash = 'spaces';
              }}>Browse Spaces</button>
            </div>
          )}

          {!bookingsLoading && !bookingsError && bookings.length > 0 && (
            <div className="booking-list">
              {bookings.map((booking) => (
                <article className="booking-card" key={booking.id}>
                  <div className="booking-card-heading">
                    <div className="booking-card-title">
                      <span className="booking-card-icon">📅</span>
                      <div>
                        <h3>{spaceNames[booking.spaceId] || `Space #${booking.spaceId}`}</h3>
                        <span className="booking-card-subtitle">Booking ID: #{booking.id}</span>
                      </div>
                    </div>
                    <span className="booking-status">{booking.status || 'CONFIRMED'}</span>
                  </div>

                  <div className="booking-details">
                    <div className="booking-detail">
                      <span className="booking-detail-label">Booking date</span>
                      <span className="booking-detail-value">{formatDate(booking.bookingDate)}</span>
                    </div>
                    <div className="booking-detail">
                      <span className="booking-detail-label">Start time</span>
                      <span className="booking-detail-value">{formatTime(booking.startTime)}</span>
                    </div>
                    <div className="booking-detail">
                      <span className="booking-detail-label">Duration</span>
                      <span className="booking-detail-value">
                        {booking.durationHours} {Number(booking.durationHours) === 1 ? 'hour' : 'hours'}
                      </span>
                    </div>
                    <div className="booking-detail">
                      <span className="booking-detail-label">Space ID</span>
                      <span className="booking-detail-value">#{booking.spaceId}</span>
                    </div>
                  </div>

                  <div className="booking-card-footer">
                    <div>
                      <span className="booking-card-total-label">Total price</span>
                      <strong className="booking-card-total">₹{Number(booking.totalPrice || 0).toFixed(2)}</strong>
                    </div>
                    {String(booking.status || 'CONFIRMED').toUpperCase() !== 'CANCELLED' && (
                      <button
                        type="button"
                        className="booking-cancel"
                        onClick={() => cancelBooking(booking)}
                        disabled={cancellingBookingId === booking.id}
                      >
                        {cancellingBookingId === booking.id ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="hero" id="home">
            <div className="hero-content">
              <span className="hero-label">SMARTER CAMPUS LIVING</span>
              <h1>Find Your Perfect Space</h1>
              <p>Discover study rooms, meeting rooms, and workspaces for learning, teamwork, and productive work.</p>
              <a className="explore-btn" href="#spaces">Explore Spaces</a>
              <p className="hero-note">Find a space that works for you.</p>
            </div>
            <div className="hero-visual">
              <div className="visual-card">
                <span className="visual-icon">🏫</span>
                <h3>Your space, your way</h3>
                <p>Study, collaborate, and get things done.</p>
                <strong>Powered by SmartSpace</strong>
              </div>
            </div>
          </section>

          <section className="spaces" id="spaces">
            <span className="section-label">EXPLORE YOUR OPTIONS</span>
            <h2>Spaces that fit your needs.</h2>
            <p className="section-description">Whether you are studying alone or collaborating with classmates, find a space for the task at hand.</p>

            <div className="filter-buttons">
              {categories.map((category) => (
                <button key={category} type="button"
                  className={activeCategory === category ? 'filter-btn active' : 'filter-btn'}
                  onClick={() => setActiveCategory(category)}>{category}</button>
              ))}
            </div>

            {loading && <p className="status-message">Loading spaces from SmartSpace...</p>}
            {!loading && error && (
              <div className="status-message error-message">
                <p>{error}</p>
                <button type="button" className="explore-btn" onClick={() => window.location.reload()}>Try Again</button>
              </div>
            )}
            {!loading && !error && filteredSpaces.length === 0 && (
              <p className="status-message">No spaces found in this category.</p>
            )}
            {!loading && !error && filteredSpaces.length > 0 && (
              <div className="space-grid">
                {filteredSpaces.map((space) => {
                  const category = getCategory(space);
                  return (
                    <article className="space-card" key={space.id}>
                      <span className="card-icon">{getIcon(category)}</span>
                      <p>{category}</p>
                      <h3>{space.title || 'Available Space'}</h3>
                      <p>{space.description || 'A space for your needs.'}</p>
                      <p className="space-location">📍 {space.location || 'Location not specified'}</p>
                      <p className="space-people">👥 {getPeople(space)}</p>
                      <p className="space-price">₹{Number(space.price || 0).toFixed(2)}<span> / hour</span></p>
                      <button type="button" className="card-link" onClick={() => openBooking(space)}>Book {space.title}</button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="benefits" id="benefits">
            <span className="section-label">WHY SMARTSPACE?</span>
            <h2>A better way to find your space.</h2>
            <div className="benefit-grid">
              <div className="benefit-item"><span>📍</span><h3>Easy to Find</h3><p>See space locations directly on each card.</p></div>
              <div className="benefit-item"><span>💰</span><h3>Clear Pricing</h3><p>Check the listed price before choosing a space.</p></div>
              <div className="benefit-item"><span>🎯</span><h3>Made for You</h3><p>Filter spaces by study, meetings, or work.</p></div>
            </div>
          </section>

          <section className="cta-section">
            <h2>Your next productive session starts here.</h2>
            <p>Explore the available spaces and find the right fit.</p>
            <a className="explore-btn" href="#spaces">Browse Spaces</a>
          </section>

          <footer>© 2026 SmartSpace. All rights reserved.</footer>
        </>
      )}

      {showAuth && (
        <div
          className="booking-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !authSubmitting) setShowAuth(false);
          }}
        >
          <section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button
              type="button"
              className="booking-close"
              aria-label="Close authentication form"
              onClick={() => setShowAuth(false)}
              disabled={authSubmitting}
            >×</button>
            <span className="section-label">WELCOME TO SMARTSPACE</span>
            <h2 id="auth-title">{authMode === 'register' ? 'Create your account' : 'Log in'}</h2>
            <p>{authMode === 'register'
              ? 'Create an account to get started.'
              : 'Log in with your SmartSpace account.'}</p>

            {authMessage && <p role="status" style={{ color: '#16803d', margin: '12px 0' }}>{authMessage}</p>}
            {authError && <p role="alert" style={{ color: '#b42318', margin: '12px 0' }}>{authError}</p>}

            <form className="booking-form" onSubmit={submitAuth}>
              {authMode === 'register' && (
                <>
                  <label htmlFor="auth-name">Full name</label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    required
                  />
                </>
              )}
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
              />
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                minLength={authMode === 'register' ? 8 : undefined}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
              />
              {authMode === 'register' && (
                <p className="booking-note">Use at least 8 characters. Your password is hashed by the backend before it is stored.</p>
              )}
              <button type="submit" className="explore-btn booking-submit" disabled={authSubmitting}>
                {authSubmitting
                  ? 'Please wait...'
                  : authMode === 'register' ? 'Create account' : 'Log in'}
              </button>
              <button
                type="button"
                className="booking-cancel"
                onClick={() => {
                  setAuthMode(authMode === 'register' ? 'login' : 'register');
                  setAuthMessage('');
                  setAuthError('');
                  setAuthPassword('');
                }}
                disabled={authSubmitting}
              >
                {authMode === 'register'
                  ? 'Already have an account? Log in'
                  : "Don't have an account? Register"}
              </button>
            </form>
          </section>
        </div>
      )}

      {selectedSpace && (
        <div className="booking-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBooking();
        }}>
          <section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
            <button type="button" className="booking-close" aria-label="Close booking form" onClick={closeBooking} disabled={submitting}>×</button>
            <span className="section-label">RESERVE YOUR SPACE</span>
            <h2 id="booking-title">Book {selectedSpace.title}</h2>
            <p>📍 {selectedSpace.location} · ₹{Number(selectedSpace.price).toFixed(2)} per hour</p>

            {bookingMessage ? (
              <div className="booking-success" role="status">
                <h3>🎉 Booking confirmed</h3>
                <p>{bookingMessage}</p>
                <button type="button" className="explore-btn" onClick={() => {
                  closeBooking();
                  openMyBookings();
                }}>View My Bookings</button>
              </div>
            ) : (
              <form className="booking-form" onSubmit={submitBooking}>
                <label htmlFor="booking-date">Booking date</label>
                <input id="booking-date" type="date" min={localToday} value={bookingDate}
                  onChange={(event) => setBookingDate(event.target.value)} required />

                <label htmlFor="booking-time">Start time</label>
                <input id="booking-time" type="time" value={startTime}
                  onChange={(event) => setStartTime(event.target.value)} required />

                <label htmlFor="booking-duration">Duration</label>
                <select id="booking-duration" value={durationHours}
                  onChange={(event) => setDurationHours(event.target.value)} required>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((hours) => (
                    <option key={hours} value={hours}>{hours} {hours === 1 ? 'hour' : 'hours'}</option>
                  ))}
                </select>

                <label htmlFor="booking-members">Number of members (maximum {Number(selectedSpace.capacity || 1)})</label>
                <select id="booking-members" value={memberCount}
                  onChange={(event) => setMemberCount(event.target.value)} required>
                  {Array.from({ length: Math.max(1, Number(selectedSpace.capacity || 1)) }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count} {count === 1 ? 'member' : 'members'}</option>
                  ))}
                </select>

                <div className="booking-note" aria-live="polite">
                  {availabilityLoading && <p>Checking availability...</p>}
                  {!availabilityLoading && availability && (
                    <p><strong>{availability.availableSeats}</strong> of {availability.capacity} seats available for this time.
                      {String(availability.bookingType).toUpperCase() === 'SHARED' ? ' Study Room bookings can share this time slot.' : ' Private room bookings reserve the whole room.'}
                    </p>
                  )}
                  {availabilityError && <p className="booking-error">{availabilityError}</p>}
                </div>

                <div className="booking-total">
                  <span>Estimated total</span>
                  <strong>₹{(Number(selectedSpace.price || 0) * Number(durationHours || 1)).toFixed(2)}</strong>
                </div>
                <p className="booking-note">The final price is calculated by the server.</p>

                {bookingError && <p className="booking-error" role="alert">{bookingError}</p>}

                <button type="submit" className="explore-btn booking-submit" disabled={submitting || availabilityLoading || (availability !== null && Number(memberCount) > Number(availability.availableSeats))}>
                  {submitting ? 'Confirming...' : 'Confirm Booking'}
                </button>
                <button type="button" className="booking-cancel" onClick={closeBooking} disabled={submitting}>Cancel</button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
