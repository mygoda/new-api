package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hide_group_ratio must persist through Edit, be readable via the direct-DB
// helper, and surface on the cached UserBase — the three paths the masking
// feature depends on (admin edit → /api/user/groups + /api/pricing).
func TestHideGroupRatioPersistsAndSurfaces(t *testing.T) {
	truncateTables(t)

	u := &User{Username: "hideme", Group: "default", HideGroupRatio: false}
	require.NoError(t, DB.Create(u).Error)

	// default helper read
	hide, err := GetUserHideGroupRatio(u.Id)
	require.NoError(t, err)
	assert.False(t, hide)

	// admin flips it on via Edit (map-based Updates must persist false→true)
	u.HideGroupRatio = true
	require.NoError(t, u.Edit(false))

	hide, err = GetUserHideGroupRatio(u.Id)
	require.NoError(t, err)
	assert.True(t, hide)

	// cached UserBase (used by GetPricing) carries the flag
	var reloaded User
	require.NoError(t, DB.First(&reloaded, u.Id).Error)
	assert.True(t, reloaded.ToBaseUser().HideGroupRatio)

	// and it can be turned back off (guards against zero-value drop in Updates)
	reloaded.HideGroupRatio = false
	require.NoError(t, reloaded.Edit(false))
	hide, _ = GetUserHideGroupRatio(u.Id)
	assert.False(t, hide)
}
