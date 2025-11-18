// Health check script for Docker HEALTHCHECK
const response = await fetch('http://localhost:8080/health');
if (response.status === 200) {
  process.exit(0);
} else {
  process.exit(1);
}


