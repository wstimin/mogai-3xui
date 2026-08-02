package service

import (
	"crypto/ecdh"
	"encoding/base64"
	"testing"
)

func TestGetNewX25519CertMatchesXrayEncoding(t *testing.T) {
	result, err := (&ServerService{}).GetNewX25519Cert()
	if err != nil {
		t.Fatalf("GetNewX25519Cert: %v", err)
	}

	pair, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	privateEncoded, privateOK := pair["privateKey"].(string)
	publicEncoded, publicOK := pair["publicKey"].(string)
	if !privateOK || !publicOK {
		t.Fatalf("unexpected key pair: %#v", pair)
	}

	privateBytes, err := base64.RawURLEncoding.DecodeString(privateEncoded)
	if err != nil || len(privateBytes) != 32 {
		t.Fatalf("invalid private key encoding: length=%d err=%v", len(privateBytes), err)
	}
	publicBytes, err := base64.RawURLEncoding.DecodeString(publicEncoded)
	if err != nil || len(publicBytes) != 32 {
		t.Fatalf("invalid public key encoding: length=%d err=%v", len(publicBytes), err)
	}
	if privateBytes[0]&7 != 0 || privateBytes[31]&0x80 != 0 || privateBytes[31]&0x40 == 0 {
		t.Fatalf("private key does not use Xray's clamped X25519 representation")
	}

	privateKey, err := ecdh.X25519().NewPrivateKey(privateBytes)
	if err != nil {
		t.Fatalf("NewPrivateKey: %v", err)
	}
	if got := privateKey.PublicKey().Bytes(); string(got) != string(publicBytes) {
		t.Fatalf("public key does not match private key")
	}
}
