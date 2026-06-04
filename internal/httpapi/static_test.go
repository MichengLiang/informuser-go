package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestStaticHandlerServesIndexAtRoot(t *testing.T) {
	handler := StaticHandler(fstest.MapFS{
		"index.html": {Data: []byte("<html>app</html>")},
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	if body := response.Body.String(); body != "<html>app</html>" {
		t.Fatalf("body = %q", body)
	}
}

func TestStaticHandlerFallsBackToIndexForBrowserRoutes(t *testing.T) {
	handler := StaticHandler(fstest.MapFS{
		"index.html": {Data: []byte("<html>app</html>")},
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/tasks/task-1", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	if body := response.Body.String(); body != "<html>app</html>" {
		t.Fatalf("body = %q", body)
	}
}

func TestStaticHandlerServesAssets(t *testing.T) {
	handler := StaticHandler(fstest.MapFS{
		"index.html":         {Data: []byte("<html>app</html>")},
		"assets/app-test.js": {Data: []byte("console.log('ok')")},
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/assets/app-test.js", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(body) != "console.log('ok')" {
		t.Fatalf("body = %q", string(body))
	}
}
