# Vercel Deployment Script for UMS
# Run this script to deploy to Vercel

Write-Host "🚀 UMS Vercel Deployment Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if Vercel CLI is installed
Write-Host "Checking Vercel CLI installation..." -ForegroundColor Yellow
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue

if (-not $vercelInstalled) {
    Write-Host "❌ Vercel CLI not found!" -ForegroundColor Red
    Write-Host "Installing Vercel CLI globally..." -ForegroundColor Yellow
    npm install -g vercel
    Write-Host "✅ Vercel CLI installed!" -ForegroundColor Green
} else {
    Write-Host "✅ Vercel CLI is installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "📋 Pre-Deployment Checklist:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "1. MongoDB Atlas connection string ready? (Yes/No)" -ForegroundColor Yellow
Write-Host "2. Gmail App Password configured? (Yes/No)" -ForegroundColor Yellow
Write-Host "3. JWT Secret prepared? (Yes/No)" -ForegroundColor Yellow
Write-Host ""

$proceed = Read-Host "Continue with deployment? (Y/N)"

if ($proceed -ne "Y" -and $proceed -ne "y") {
    Write-Host "❌ Deployment cancelled" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "🔑 Logging into Vercel..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
vercel login

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "🚀 Starting Deployment..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "First, we'll create a preview deployment..." -ForegroundColor Yellow
Write-Host ""

vercel

Write-Host ""
Write-Host "✅ Preview deployment complete!" -ForegroundColor Green
Write-Host ""
$deployProd = Read-Host "Deploy to PRODUCTION? (Y/N)"

if ($deployProd -eq "Y" -or $deployProd -eq "y") {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host "🌐 Deploying to PRODUCTION..." -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    vercel --prod
    
    Write-Host ""
    Write-Host "🎉 DEPLOYMENT COMPLETE! 🎉" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Go to Vercel Dashboard: https://vercel.com/dashboard" -ForegroundColor Yellow
    Write-Host "2. Add environment variables (see VERCEL_DEPLOYMENT.md)" -ForegroundColor Yellow
    Write-Host "3. Update BASE_URL with your Vercel domain" -ForegroundColor Yellow
    Write-Host "4. Redeploy: vercel --prod" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "Production deployment skipped." -ForegroundColor Yellow
    Write-Host "Run 'vercel --prod' when ready to deploy to production." -ForegroundColor Yellow
}
