const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Car gallery data (images sourced from Unsplash)
const cars = [
  {
    id: 1,
    name: 'Tesla Model S',
    brand: 'Tesla',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1560876822-647e6c60996a?w=800&q=80&auto=format&fit=crop',
    description: 'All-electric luxury sedan with incredible performance and range.'
  },
  {
    id: 2,
    name: 'Ford Mustang',
    brand: 'Ford',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80&auto=format&fit=crop',
    description: 'Iconic American muscle car with timeless design and raw power.'
  },
  {
    id: 3,
    name: 'Porsche 911',
    brand: 'Porsche',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80&auto=format&fit=crop',
    description: 'Legendary sports car known for precision engineering and timeless style.'
  },
  {
    id: 4,
    name: 'Lamborghini Huracán',
    brand: 'Lamborghini',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80&auto=format&fit=crop',
    description: 'Exotic Italian supercar with aggressive styling and breathtaking speed.'
  },
  {
    id: 5,
    name: 'BMW M4',
    brand: 'BMW',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1555215695-3004980ad9a6?w=800&q=80&auto=format&fit=crop',
    description: 'Ultimate driving machine combining luxury, comfort, and track-ready performance.'
  },
  {
    id: 6,
    name: 'Mercedes-Benz S-Class',
    brand: 'Mercedes-Benz',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1494976388531-d1058494cba5?w=800&q=80&auto=format&fit=crop',
    description: 'The epitome of luxury, comfort, and cutting-edge automotive technology.'
  },
  {
    id: 7,
    name: 'Chevrolet Corvette',
    brand: 'Chevrolet',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80&auto=format&fit=crop',
    description: 'Mid-engine American sports car with exotic looks and supercar performance.'
  },
  {
    id: 8,
    name: 'Audi R8',
    brand: 'Audi',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1511919884224-6e8836a58170?w=800&q=80&auto=format&fit=crop',
    description: 'German engineering masterpiece with Quattro all-wheel drive and V10 power.'
  },
  {
    id: 9,
    name: 'Toyota Supra',
    brand: 'Toyota',
    year: 2024,
    image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80&auto=format&fit=crop',
    description: 'Legendary Japanese sports car reborn with modern performance and classic styling.'
  }
];

app.get('/', (req, res) => {
  res.render('index', { cars, title: 'Awesome Cars' });
});

// Car details page (dummy detail view for a single car)
app.get('/car/:id', (req, res) => {
  const car = cars.find((c) => c.id === parseInt(req.params.id, 10));
  if (!car) {
    return res.status(404).render('404', { title: 'Car Not Found' });
  }
  res.render('car-details', { car, title: `${car.name} - Awesome Cars` });
});

// Brands page
app.get('/brands', (req, res) => {
  const brands = [...new Set(cars.map((c) => c.brand))];
  res.render('brands', { brands, title: 'Brands - Awesome Cars' });
});

// About page
app.get('/about', (req, res) => {
  res.render('about', { title: 'About - Awesome Cars' });
});

// Contact page
app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact - Awesome Cars' });
});

// Liveness/readiness endpoint used by Docker HEALTHCHECK and the deploy script
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    version: process.env.APP_VERSION || 'dev'
  });
});

// 404 handler – render custom 404 page for unmatched routes
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Not Found' });
});

// Only start listening when run directly (so tests can import the app)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
