# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported |
| ------- | --------- |
| 0.5.x   | Yes       |
| < 0.5   | No        |

## Reporting a Vulnerability

We take the security of Binnacle seriously. If you discover a security
vulnerability, please follow these guidelines.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of these methods:

1. **GitHub Security Advisory**: Use the [GitHub Security Advisory](https://github.com/NearlCrews/signalk-binnacle/security/advisories/new) feature (preferred).
2. **GitHub Issues**: For non-sensitive security concerns, open an [issue](https://github.com/NearlCrews/signalk-binnacle/issues).

### What to Include

Please include the following information in your report:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up

### Response Timeline

- **Initial Response**: within 48 hours of report
- **Status Update**: within 7 days with a preliminary assessment
- **Fix Timeline**: depends on severity, typically within 30 days

## Security Best Practices

When using this webapp:

1. **Keep Updated**: always use the latest version.
2. **Network Security**: ensure your Signal K server is properly secured, and
   prefer HTTPS (see the README's offline operation and SSL section).
3. **Access Control**: approve Binnacle's access request deliberately in the
   Signal K admin UI, and limit access to the admin interface.
4. **Trust Stores**: when using a self-signed certificate, install its root
   into your device trust store rather than clicking through warnings.
5. **Monitor Logs**: watch for unusual activity in the Signal K logs.

## Dependency Security

This project uses:

- `npm audit` for vulnerability scanning
- Automated dependency updates via Dependabot for security patches

Run a security audit:

```bash
npm audit
```

## Data Handling

Binnacle runs entirely in the browser and is served by your Signal K server.
It authenticates to that server with an access token you approve, stored in
the browser's local storage for that origin only; routes, tracks, charts, and
profiles you save go to your own server or stay in the browser (IndexedDB).

For map and weather data it calls free public services (OpenFreeMap,
Open-Meteo, RainViewer, NOAA, EMODnet, GEBCO, NASA GIBS, OpenSeaMap, and the
VLIZ Marine Regions service). Those requests carry only map coordinates: tile
areas for the layers you have turned on, and an approximate vessel position
for the local forecast, conditions, and nearest tide station. No personal
data, credentials, or identifiers are sent to any third party. Note that a
position query is inherent to fetching local conditions; if that is a
concern, leave the weather and tide features closed.

External links in point-of-interest details are scheme-checked (`http:` and
`https:` only), and structured note content renders as text, never injected
HTML.

## Signal K Security

This webapp operates within the Signal K server environment. Please also refer
to the [Signal K documentation](https://signalk.org/documentation/) and Signal
K server security best practices.

## Marine Safety Notice

This webapp is designed for marine navigation systems. While we strive for
security and reliability:

- **Not for Safety-Critical Use**: this software should not be relied upon as
  the sole means of navigation.
- **Professional Equipment**: always maintain certified navigation equipment.
- **Regular Verification**: chart overlays, weather, and points of interest
  come from third-party sources and are provided "as is"; verify all
  navigation data against official sources.
- **Test Thoroughly**: test in non-critical conditions before relying on this
  webapp.

## Disclosure Policy

- We will coordinate disclosure timing with the reporter.
- Public disclosure will occur after a fix is available.
- Credit will be given to reporters (if desired).
- A security advisory will be published on GitHub.
