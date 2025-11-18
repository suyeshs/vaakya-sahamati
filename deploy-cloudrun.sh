#!/bin/bash

# Samvad GCP - Cloud Run Deployment Script
# Deploys backend-bun and test-client-app to existing Cloud Run services

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="sahamati-labs"
REGION="us-central1"
BACKEND_SERVICE="samvad-api-bun"
CLIENT_SERVICE="samvad-test-client"
BACKEND_URL="https://samvad-api-bun-334610188311.us-central1.run.app"
CLIENT_URL="https://samvad-test-client-334610188311.us-central1.run.app"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Install: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi

    # Check if logged in
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        print_error "Not logged in to gcloud. Run: gcloud auth login"
        exit 1
    fi

    # Set project
    gcloud config set project "$PROJECT_ID" --quiet

    print_success "Prerequisites check passed!"
}

# Function to deploy backend using Cloud Build
deploy_backend() {
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_info "📦 Deploying Backend (samvad-api-bun)..."
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    cd backend-bun

    # Check if cloudbuild.yaml exists
    if [ ! -f "cloudbuild.yaml" ]; then
        print_error "cloudbuild.yaml not found in backend-bun/"
        exit 1
    fi

    # Submit build
    print_info "Submitting build to Cloud Build..."
    gcloud builds submit \
        --config=cloudbuild.yaml \
        --project="$PROJECT_ID" \
        --region="$REGION"

    print_success "Backend deployed successfully!"
    print_info "Backend URL: $BACKEND_URL"

    cd ..
}

# Function to deploy client using Cloud Build
deploy_client() {
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_info "📦 Deploying Client (samvad-test-client)..."
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    cd test-client-app

    # Check if cloudbuild.yaml exists
    if [ ! -f "cloudbuild.yaml" ]; then
        print_error "cloudbuild.yaml not found in test-client-app/"
        exit 1
    fi

    # Submit build
    print_info "Submitting build to Cloud Build..."
    gcloud builds submit \
        --config=cloudbuild.yaml \
        --project="$PROJECT_ID" \
        --region="$REGION"

    print_success "Client deployed successfully!"
    print_info "Client URL: $CLIENT_URL"

    cd ..
}

# Function to test deployments
test_deployments() {
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_info "🧪 Testing Deployments..."
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Test backend
    print_info "Testing backend endpoint..."
    if curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL" | grep -q "200\|301\|302"; then
        print_success "Backend is responding ✓"
    else
        print_warning "Backend may not be responding correctly"
    fi

    # Test client
    print_info "Testing client endpoint..."
    if curl -s -o /dev/null -w "%{http_code}" "$CLIENT_URL" | grep -q "200\|301\|302"; then
        print_success "Client is responding ✓"
    else
        print_warning "Client may not be responding correctly"
    fi
}

# Function to display deployment summary
deployment_summary() {
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_success "🎉 Deployment Complete!"
    print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║                     Service URLs                                   ║"
    echo "╠════════════════════════════════════════════════════════════════════╣"
    echo "║  Backend:  $BACKEND_URL  ║"
    echo "║  Client:   $CLIENT_URL  ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Next steps:"
    echo "──────────────────────────────────────────────────────────────────"
    echo "1. Test Backend WebSocket:"
    echo "   wscat -c wss://samvad-api-bun-334610188311.us-central1.run.app/api/gemini-live-stream"
    echo ""
    echo "2. Visit Client Application:"
    echo "   open $CLIENT_URL"
    echo ""
    echo "3. View Backend Logs:"
    echo "   gcloud run logs tail $BACKEND_SERVICE --project=$PROJECT_ID"
    echo ""
    echo "4. View Client Logs:"
    echo "   gcloud run logs tail $CLIENT_SERVICE --project=$PROJECT_ID"
    echo ""
    echo "5. Monitor Services:"
    echo "   gcloud run services list --project=$PROJECT_ID"
    echo "──────────────────────────────────────────────────────────────────"
}

# Main deployment flow
main() {
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║   Samvad GCP - Cloud Run Deployment Script               ║"
    echo "║   Project: $PROJECT_ID                             ║"
    echo "║   Region: $REGION                                ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    # Parse command line arguments
    DEPLOY_BACKEND=true
    DEPLOY_CLIENT=true
    RUN_TESTS=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend-only)
                DEPLOY_CLIENT=false
                shift
                ;;
            --client-only)
                DEPLOY_BACKEND=false
                shift
                ;;
            --test)
                RUN_TESTS=true
                shift
                ;;
            --help)
                echo "Usage: ./deploy-cloudrun.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --backend-only    Deploy only the backend service"
                echo "  --client-only     Deploy only the client service"
                echo "  --test            Run tests after deployment"
                echo "  --help            Show this help message"
                echo ""
                echo "Examples:"
                echo "  ./deploy-cloudrun.sh                    # Deploy both services"
                echo "  ./deploy-cloudrun.sh --backend-only     # Deploy only backend"
                echo "  ./deploy-cloudrun.sh --test             # Deploy and test"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Run './deploy-cloudrun.sh --help' for usage information."
                exit 1
                ;;
        esac
    done

    # Run deployment steps
    check_prerequisites

    # Deploy services
    if [ "$DEPLOY_BACKEND" = true ]; then
        deploy_backend
    fi

    if [ "$DEPLOY_CLIENT" = true ]; then
        deploy_client
    fi

    # Run tests if requested
    if [ "$RUN_TESTS" = true ]; then
        test_deployments
    fi

    # Show summary
    deployment_summary
}

# Run main function
main "$@"
