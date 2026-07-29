package locale

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/nicksnyder/go-i18n/v2/i18n"
	"golang.org/x/text/language"
)

func TestTranslationFilesParseWithGoI18n(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "translation", "*.json"))
	if err != nil {
		t.Fatalf("find translation files: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("no translation files found")
	}

	bundle := i18n.NewBundle(language.MustParse("en-US"))
	bundle.RegisterUnmarshalFunc("json", json.Unmarshal)

	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		if _, err := bundle.ParseMessageFileBytes(data, filepath.ToSlash(file)); err != nil {
			t.Errorf("parse %s: %v", file, err)
		}
	}
}
